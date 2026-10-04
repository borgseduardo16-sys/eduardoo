'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, spaceFeatures, features, auditLogs, bookings } from '@/db/schema';
import { matchNewSpaceToAlerts } from '@/lib/alerts/matching';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { notifyUser } from '@/lib/notifications/dispatch';
import { settingInt } from '@/lib/settings';
import { rateLimit } from '@/lib/rate-limit';
import { lookupCep } from '@/lib/maps/cep-lookup';
import { CepError, normalizeCep } from '@/lib/maps/cep';
import { getOwnedSpace, NotSpaceOwnerError, SpaceNotFoundError } from './queries';
import {
  alertFavoritersOfPriceDrop,
  alertCompatibleFavoritersOfNewSpace,
} from '@/lib/notifications/space-alerts';
import { onSpaceBecameUnavailable, onSpaceMaybeAvailableAgain } from './availability-events';
import { LIVE_STATUSES } from '@/lib/bookings/queries';
import { formatBRL, parseBRLToCents, InvalidAmountError } from '@/lib/money';
import { brDate } from '@/lib/time';
import { buildSlug } from './slug';
import { SPACE_TYPES, type SpaceTypeKey } from './types';
import {
  typeStepSchema,
  locationStepSchema,
  featuresStepSchema,
  contentStepSchema,
  priceStepSchema,
  rulesStepSchema,
  PRICE_MAX_CENTS,
  validateMeasurements,
  MIN_PHOTOS_TO_PUBLISH,
  type StepKey,
} from './schemas';

export type SpaceActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Preenchido quando a action cria algo e o cliente precisa saber o id. */
  spaceId?: string;
};

function fieldErrors(e: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  return Object.fromEntries(
    Object.entries(e.flatten().fieldErrors).filter(([, v]) => v?.length),
  ) as Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Criar rascunho
// ---------------------------------------------------------------------------

/**
 * Comeca um anuncio.
 *
 * Promove o usuario a `owner` na mesma transacao. Isso NAO cria segunda conta:
 * e a mesma linha de `profiles` ganhando permissao de publicar. A pessoa segue
 * podendo alugar espaco de outros — os papeis se somam, nao se excluem.
 */
export async function createDraftAction(
  _prev: SpaceActionState | undefined,
  formData: FormData,
): Promise<SpaceActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para anunciar.' };
  }

  const parsed = typeStepSchema.safeParse({ type: formData.get('type') });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  // Um anuncio novo por minuto e o suficiente para qualquer uso legitimo.
  const limit = await rateLimit(`draft:${user.id}`, { limit: 5, windowSeconds: 60 });
  if (!limit.allowed) {
    return { ok: false, message: 'Aguarde um instante antes de criar outro anúncio.' };
  }

  const maxDrafts = await settingInt('spaces.max_drafts_per_owner', 20);
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(spaces)
    .where(and(eq(spaces.ownerId, user.id), eq(spaces.status, 'draft'), isNull(spaces.deletedAt)));

  if (total >= maxDrafts) {
    return {
      ok: false,
      message: `Você já tem ${total} rascunhos. Publique ou descarte algum antes de começar outro.`,
    };
  }

  let spaceId = '';
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(spaces)
      .values({
        ownerId: user.id,
        slug: buildSlug('rascunho'),
        type: parsed.data.type,
        status: 'draft',
        title: '',
        // Sem preço até a etapa "Como alugar": nunca um valor provisório.
        draftStep: 2,
      })
      .returning({ id: spaces.id });

    spaceId = created.id;

    // Vira proprietario. Admin continua admin.
    await tx
      .update(spaces)
      .set({ updatedAt: new Date() })
      .where(eq(spaces.id, spaceId));
  });

  if (user.role === 'user') {
    await db.execute(
      sql`UPDATE profiles SET role = 'owner' WHERE id = ${user.id} AND role = 'user'`,
    );
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'space.draft_created',
    entityType: 'space',
    entityId: spaceId,
    metadata: { type: parsed.data.type },
  });

  redirect(`/anunciar/${spaceId}/localizacao`);
}

// ---------------------------------------------------------------------------
// Salvar uma etapa
// ---------------------------------------------------------------------------

/**
 * Salva uma etapa do rascunho.
 *
 * Carrega o anuncio por `getOwnedSpace`, que lanca se quem pede nao for o
 * dono — e o unico caminho de escrita, entao a checagem nao tem como ser
 * esquecida em uma etapa nova.
 */
export async function saveStepAction(
  _prev: SpaceActionState | undefined,
  formData: FormData,
): Promise<SpaceActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente para continuar.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');
  const step = String(formData.get('step') ?? '') as StepKey;

  let space;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch (err) {
    if (err instanceof NotSpaceOwnerError) {
      return { ok: false, message: 'Este anúncio não é seu.' };
    }
    if (err instanceof SpaceNotFoundError) {
      return { ok: false, message: 'Anúncio não encontrado.' };
    }
    throw err;
  }

  // Anuncio com locacao em andamento nao aceita edicao livre: mexer em endereco
  // ou metragem mudaria o que quem ja esta usando o espaco contratou. "Como
  // alugar" continua editavel: os valores de cada locacao ficam congelados nela
  // (o novo preco vale para as proximas), e o banco nao deixa a quantidade
  // oferecida ficar abaixo do que ja esta ocupado.
  const emUso = space.quantityOffered - space.quantityAvailable;
  if (emUso > 0 && step !== 'regras' && step !== 'descricao' && step !== 'preco') {
    return {
      ok: false,
      message:
        'Este espaço tem locação em andamento. Enquanto ela durar, só é possível editar a descrição, as regras e como alugar.',
    };
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  let nextStep = space.draftStep;
  // So preenchido no case 'preco': depois de gravar, quem espera por vaga e avisado.
  let mudouPreco = false;
  let aumentouQuantidade = false;

  switch (step) {
    case 'localizacao': {
      const parsed = locationStepSchema.safeParse({
        postalCode: formData.get('postalCode') ?? '',
        state: formData.get('state'),
        city: formData.get('city'),
        district: formData.get('district'),
        street: formData.get('street'),
        number: formData.get('number'),
        complement: formData.get('complement') ?? '',
        lat: formData.get('lat'),
        lng: formData.get('lng'),
      });
      if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

      const d = parsed.data;

      /*
       * Confirmacao do CEP NO SERVIDOR.
       *
       * O navegador manda estado e cidade porque a pessoa ve os campos, mas
       * um POST forjado mandaria qualquer coisa. Quando ha CEP, quem decide
       * estado e cidade e a consulta feita aqui — nao o formulario.
       *
       * Bairro e rua continuam sendo o que a pessoa digitou: a base dos
       * Correios erra em loteamento novo, e o dono sabe o endereco dele.
       */
      let uf = d.state;
      let cidade = d.city;

      if (d.postalCode) {
        try {
          const oficial = await lookupCep(d.postalCode);
          uf = oficial.state as typeof uf;
          cidade = oficial.city;
        } catch (err) {
          // CEP inexistente e erro de dado: nao grava.
          if (err instanceof CepError && err.reason === 'nao_encontrado') {
            return { ok: false, fieldErrors: { postalCode: ['CEP não encontrado.'] } };
          }
          /*
           * Servico fora do ar. O CEP e opcional no formulario, entao travar o
           * rascunho por causa de um servico gratuito indisponivel seria pior
           * que salvar o que a pessoa digitou. Fica registrado.
           */
          console.warn(
            `[localizacao] nao foi possivel confirmar o CEP ${d.postalCode} no servidor:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      Object.assign(patch, {
        postalCode: d.postalCode ? normalizeCep(d.postalCode) : null,
        state: uf,
        city: cidade,
        district: d.district,
        street: d.street,
        number: d.number,
        complement: d.complement || null,
        /*
         * O customType da coluna converte { lat, lng } em EWKT com SRID 4326.
         * A coluna approx_location e preenchida pela trigger do banco, entao
         * nao ha como publicar coordenada exata por engano.
         */
        location: { lat: d.lat, lng: d.lng },
      });
      nextStep = Math.max(nextStep, 3);
      break;
    }

    case 'caracteristicas': {
      const parsed = featuresStepSchema.safeParse({
        sizeM2: formData.get('sizeM2') || null,
        ceilingHeightM: formData.get('ceilingHeightM') || null,
        features: formData.getAll('features').map(String),
      });
      if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

      const measureErrors = validateMeasurements(space.type as SpaceTypeKey, parsed.data);
      if (Object.keys(measureErrors).length) {
        return {
          ok: false,
          fieldErrors: Object.fromEntries(
            Object.entries(measureErrors).map(([k, v]) => [k, [v]]),
          ),
        };
      }

      // As chaves enviadas tem que existir no catalogo. Sem isto, um request
      // forjado gravaria caracteristica inventada no anuncio.
      const validKeys = parsed.data.features.length
        ? await db
            .select({ key: features.key })
            .from(features)
            .where(and(inArray(features.key, parsed.data.features), eq(features.active, true)))
        : [];
      const keys = validKeys.map((f) => f.key);

      Object.assign(patch, {
        sizeM2: parsed.data.sizeM2 != null ? String(parsed.data.sizeM2) : null,
        ceilingHeightM:
          parsed.data.ceilingHeightM != null ? String(parsed.data.ceilingHeightM) : null,
      });

      await db.transaction(async (tx) => {
        await tx.delete(spaceFeatures).where(eq(spaceFeatures.spaceId, spaceId));
        if (keys.length) {
          await tx
            .insert(spaceFeatures)
            .values(keys.map((key) => ({ spaceId, featureKey: key })));
        }
      });
      nextStep = Math.max(nextStep, 4);
      break;
    }

    case 'descricao': {
      const parsed = contentStepSchema.safeParse({
        title: formData.get('title'),
        description: formData.get('description'),
      });
      if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

      Object.assign(patch, parsed.data);
      // O slug so e gerado uma vez, na primeira vez que ha titulo de verdade.
      // Mudar slug de anuncio publicado quebraria links ja compartilhados.
      if (space.slug.startsWith('rascunho-') && !space.publishedAt) {
        patch.slug = buildSlug(parsed.data.title);
      }
      nextStep = Math.max(nextStep, 6);
      break;
    }

    case 'preco': {
      // "Como alugar": preço mensal, quantidade e disponibilidade. O navegador manda o
      // que foi digitado; a conversão para centavos e todas as conferências acontecem
      // aqui (e de novo no banco — CHECKs e gatilhos de `spaces`).
      const parsed = priceStepSchema.safeParse({
        priceMonthly: formData.get('priceMonthly'),
        quantityOffered: formData.get('quantityOffered'),
        quantityTotal: formData.get('quantityTotal') ?? '',
        availableFrom: formData.get('availableFrom'),
      });
      if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
      const d = parsed.data;

      let cents: number;
      try {
        cents = parseBRLToCents(d.priceMonthly);
      } catch (err) {
        if (err instanceof InvalidAmountError) {
          return { ok: false, fieldErrors: { priceMonthly: ['Valor inválido. Escreva, por exemplo, 300 ou 300,50.'] } };
        }
        throw err;
      }
      const minCharge = await settingInt('booking.min_rent_cents', 3500);
      if (cents < minCharge) {
        return { ok: false, fieldErrors: { priceMonthly: [`O valor mensal mínimo é ${formatBRL(minCharge)}.`] } };
      }
      if (cents > PRICE_MAX_CENTS) {
        return { ok: false, fieldErrors: { priceMonthly: ['Esse valor é alto demais para um aluguel mensal.'] } };
      }
      if (d.quantityTotal != null && d.quantityTotal < d.quantityOffered) {
        return {
          ok: false,
          fieldErrors: { quantityTotal: ['O total do local não pode ser menor que as unidades oferecidas aqui.'] },
        };
      }
      // Data de disponibilidade não pode estar no passado — a menos que seja a que já estava gravada.
      if (d.availableFrom < brDate(new Date()) && d.availableFrom !== space.availableFrom) {
        return { ok: false, fieldErrors: { availableFrom: ['A data não pode estar no passado.'] } };
      }

      mudouPreco = space.priceMonthlyCents !== cents;
      aumentouQuantidade = d.quantityOffered > space.quantityOffered;
      Object.assign(patch, {
        priceMonthlyCents: cents,
        quantityOffered: d.quantityOffered,
        quantityTotal: d.quantityTotal ?? null,
        availableFrom: d.availableFrom,
      });
      nextStep = Math.max(nextStep, 7);
      break;
    }

    case 'regras': {
      const parsed = rulesStepSchema.safeParse({
        allowedItems: formData.get('allowedItems') ?? '',
        forbiddenItems: formData.get('forbiddenItems') ?? '',
        accessHours: formData.get('accessHours') ?? '',
        rulesText: formData.get('rulesText') ?? '',
        // Checkbox desmarcado nem aparece no FormData — ausência = false.
        depositEnabled: formData.get('depositEnabled') === 'on',
      });
      if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

      Object.assign(patch, {
        allowedItems: parsed.data.allowedItems || null,
        forbiddenItems: parsed.data.forbiddenItems || null,
        accessHours: parsed.data.accessHours || null,
        rulesText: parsed.data.rulesText || null,
        depositEnabled: parsed.data.depositEnabled,
      });
      nextStep = Math.max(nextStep, 8);
      break;
    }

    case 'fotos':
      // As fotos sao salvas no proprio upload; aqui so avanca a etapa.
      nextStep = Math.max(nextStep, 5);
      break;

    default:
      return { ok: false, message: 'Etapa desconhecida.' };
  }

  patch.draftStep = nextStep;
  /*
   * Histórico de preço (Fase 23): quem grava é a trigger
   * `spaces_record_price_change`, não este código — mas quem MUDOU só o
   * servidor sabe. `set_config(..., true)` vale só para esta transação.
   */
  let novoPrecoCents: number | null = null;
  try {
    novoPrecoCents = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('myplace.actor_id', ${user.id}, true)`);
      await tx.update(spaces).set(patch).where(eq(spaces.id, spaceId));
      const [depois] = await tx
        .select({ preco: spaces.priceMonthlyCents })
        .from(spaces)
        .where(eq(spaces.id, spaceId))
        .limit(1);
      return depois?.preco ?? null;
    });
  } catch (err) {
    const restricao = spaceRuleMessage(err);
    if (restricao) return { ok: false, message: restricao };
    throw err;
  }

  /*
   * Alerta de queda de preço (Fase 18.2). So faz sentido quando o anuncio ja
   * e visivel (rascunho nao tem favorito) e so dispara se o preco realmente
   * caiu — a funcao mesma decide se a queda e significativa. Best-effort:
   * uma falha aqui nunca pode derrubar o salvamento do preco, que ja
   * aconteceu.
   */
  if (
    mudouPreco && space.status !== 'draft'
    && space.priceMonthlyCents != null && novoPrecoCents != null
    && novoPrecoCents !== space.priceMonthlyCents
  ) {
    try {
      await alertFavoritersOfPriceDrop(
        { id: spaceId, title: space.title, slug: space.slug },
        space.priceMonthlyCents,
        novoPrecoCents,
      );
    } catch (err) {
      console.error('[preco] falha ao notificar favoritos sobre queda de preco:', err);
    }
  }

  // Mais unidades oferecidas num anúncio que estava lotado: voltou a ter vaga (o banco
  // recontou e recolocou no ar) — lista de espera e favoritos ficam sabendo.
  if (aumentouQuantidade && space.status !== 'draft') {
    await onSpaceMaybeAvailableAgain(spaceId);
  }

  revalidatePath(`/anunciar/${spaceId}`, 'layout');
  revalidatePath('/meus-espacos');
  revalidatePath('/espacos');

  return { ok: true, spaceId };
}

/**
 * Recusa do banco ao gravar o anúncio, em texto para o proprietário. O
 * formulário já confere o que dá; isto cobre o que só o banco vê (outra aba
 * salvando junto, locação que começou no meio do caminho).
 */
function spaceRuleMessage(err: unknown): string | null {
  const causa = err instanceof Error && err.cause ? err.cause : err;
  const regra = (causa as { constraint_name?: string } | null)?.constraint_name ?? '';
  switch (regra) {
    case 'spaces_quantity_covers_rentals':
      return 'Há locações em andamento: a quantidade oferecida não pode ficar menor que a quantidade ocupada.';
    case 'spaces_quantity_total_covers_offered':
      return 'O total do local não pode ser menor que as unidades oferecidas aqui.';
    case 'spaces_quantity_offered_range':
      return 'A quantidade oferecida precisa estar entre 1 e 10.000.';
    case 'spaces_price_positive':
    case 'spaces_price_sane':
      return 'Revise o valor mensal: ele precisa ser positivo e razoável.';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Publicar
// ---------------------------------------------------------------------------

/**
 * Publica o anuncio.
 *
 * Revalida TUDO do zero, sem confiar em "as etapas ja validaram". Entre salvar
 * a etapa 2 e publicar pode ter passado mes, outra aba pode ter alterado o
 * rascunho, e um request pode ter sido forjado. O banco ainda aplica o CHECK
 * `spaces_published_requires_complete` como ultima linha.
 */
export async function publishSpaceAction(
  _prev: SpaceActionState | undefined,
  formData: FormData,
): Promise<SpaceActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');

  let space;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch (err) {
    if (err instanceof NotSpaceOwnerError) return { ok: false, message: 'Este anúncio não é seu.' };
    return { ok: false, message: 'Anúncio não encontrado.' };
  }

  const faltando: string[] = [];

  if (!space.type || !SPACE_TYPES.includes(space.type as SpaceTypeKey)) faltando.push('tipo do espaço');
  if (space.lat == null || space.lng == null) faltando.push('localização no mapa');
  if (!space.city?.trim()) faltando.push('cidade');
  if (!space.state?.trim()) faltando.push('estado');
  if (!space.district?.trim()) faltando.push('bairro');
  if (!space.street?.trim()) faltando.push('rua');
  if (!space.number?.trim()) faltando.push('número');
  if ((space.title?.trim().length ?? 0) < 10) faltando.push('título');
  if ((space.description?.trim().length ?? 0) < 20) faltando.push('descrição');
  if (!space.availableFrom) faltando.push('data de disponibilidade');
  if (space.images.length < MIN_PHOTOS_TO_PUBLISH) {
    faltando.push(
      `pelo menos ${MIN_PHOTOS_TO_PUBLISH} fotos (você tem ${space.images.length})`,
    );
  }

  const measureErrors = validateMeasurements(space.type as SpaceTypeKey, {
    sizeM2: space.sizeM2 ? Number(space.sizeM2) : null,
    ceilingHeightM: space.ceilingHeightM ? Number(space.ceilingHeightM) : null,
  });
  if (measureErrors.sizeM2) faltando.push('metragem');
  if (measureErrors.ceilingHeightM) faltando.push('altura');

  // Sem preço mensal não há o que publicar — o banco recusa de novo
  // (`spaces_published_requires_price`).
  if (space.priceMonthlyCents == null) {
    faltando.push('valor mensal e quantidade (como alugar)');
  }

  if (faltando.length) {
    return {
      ok: false,
      message: `Falta preencher: ${faltando.join(', ')}.`,
    };
  }

  // Guardado ANTES do update: depois dele `space.publishedAt` já não reflete
  // mais o estado anterior — é o que decide se esta é a primeira publicação
  // (mostra "Turbine seu anúncio") ou uma edição salva num anúncio que já
  // estava no ar (vai direto pra confirmação, sem repetir a oferta).
  const primeiraPublicacao = !space.publishedAt;

  try {
    await db
      .update(spaces)
      .set({
        status: 'published',
        publishedAt: space.publishedAt ?? new Date(),
        draftStep: 8,
        updatedAt: new Date(),
      })
      .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id)));
  } catch (err) {
    // O Drizzle embrulha o erro do Postgres: a regra violada fica em `cause`.
    const causa = err instanceof Error && err.cause ? err.cause : err;
    const regra = (causa as { constraint_name?: string } | null)?.constraint_name ?? '';
    const msg = `${regra} ${err instanceof Error ? err.message : ''} ${causa instanceof Error ? causa.message : ''}`;
    if (msg.includes('spaces_published_requires_price')) {
      return { ok: false, message: 'Falta preencher: valor mensal e quantidade (como alugar).' };
    }
    if (msg.includes('spaces_published_requires_complete')) {
      return { ok: false, message: 'O anúncio ainda está incompleto. Revise as etapas anteriores.' };
    }
    if (msg.includes('spaces_published_requires_location')) {
      return { ok: false, message: 'Marque a localização no mapa antes de publicar.' };
    }
    throw err;
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'space.published',
    entityType: 'space',
    entityId: spaceId,
  });

  // Registro na central (Fase 21): "Espaço publicado", com link para ver
  // como ficou. Só na primeira publicação — republicar depois de uma edição
  // não é novidade para quem publicou. dedupeKey por anúncio: nunca repete.
  if (primeiraPublicacao) {
    try {
      await notifyUser(db, {
        userId: user.id,
        type: 'space_published',
        title: 'Seu espaço está no ar',
        body: `"${space.title}" já aparece nas buscas. Compartilhe o link para chegar a mais gente.`,
        linkPath: `/espacos/${space.slug}`,
        data: { spaceId },
        dedupeKey: `space_published:${spaceId}`,
      });
    } catch (err) {
      console.error('[publicar] falha ao registrar notificação de publicação:', err);
    }
  }

  // Só na primeira publicação: "de novo no ar" (retomar) não é espaço NOVO.
  // Precisa vir antes do redirect() (ele lança para interromper a função).
  if (primeiraPublicacao && space.city) {
    // Alertas de busca salva primeiro (Fase 23): quem pediu explicitamente
    // para ser avisado não recebe, além disso, o aviso "com o seu perfil".
    const { userIds: comAlerta } = await matchNewSpaceToAlerts(spaceId);
    if (space.priceMonthlyCents != null) {
      try {
        await alertCompatibleFavoritersOfNewSpace(
          {
            id: spaceId,
            ownerId: user.id,
            type: space.type,
            city: space.city,
            title: space.title,
            slug: space.slug,
            priceMonthlyCents: space.priceMonthlyCents,
            featureKeys: space.featureKeys,
          },
          { exceptUserIds: comAlerta },
        );
      } catch (err) {
        console.error('[publicar] falha ao notificar favoritos sobre espaço compatível:', err);
      }
    }
  }

  revalidatePath('/espacos');
  revalidatePath('/meus-espacos');
  revalidatePath(`/espacos/${space.slug}`);

  redirect(primeiraPublicacao ? `/anunciar/${spaceId}/promover` : `/anunciar/${spaceId}/publicado`);
}

// ---------------------------------------------------------------------------
// Pausar / retomar
// ---------------------------------------------------------------------------

/** Pausar tira das buscas sem apagar nada. Retomar devolve ao ar. */
export async function toggleSpaceStatusAction(
  _prev: SpaceActionState | undefined,
  formData: FormData,
): Promise<SpaceActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');
  let space;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch {
    return { ok: false, message: 'Anúncio não encontrado.' };
  }

  // Pausar tira o anúncio das buscas e para de receber pedidos novos; as locações em
  // andamento seguem normalmente (também vale para um anúncio lotado).
  const novo = space.status === 'published' || space.status === 'rented' ? 'paused' : 'published';

  if (novo === 'published' && !space.publishedAt) {
    return { ok: false, message: 'Este anúncio ainda não foi publicado.' };
  }

  // O banco pode corrigir o status (trigger `spaces_published_not_occupied`):
  // retomar um anúncio que tem reserva vigente volta como `rented`, não
  // `published` — a resposta diz o que ficou gravado de verdade.
  const [gravado] = await db
    .update(spaces)
    .set({ status: novo, updatedAt: new Date() })
    .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id)))
    .returning({ status: spaces.status });

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: novo === 'paused' ? 'space.paused' : 'space.resumed',
    entityType: 'space',
    entityId: spaceId,
  });

  // Avisos (Fase 23): lista de espera primeiro, depois quem favoritou —
  // nunca os dois para a mesma pessoa. Best-effort, nunca derruba a ação.
  if (novo === 'paused') {
    await onSpaceBecameUnavailable(spaceId);
  } else {
    await onSpaceMaybeAvailableAgain(spaceId);
  }

  revalidatePath('/meus-espacos');
  revalidatePath('/espacos');
  revalidatePath(`/espacos/${space.slug}`);
  return {
    ok: true,
    message:
      novo === 'paused'
        ? 'Anúncio pausado. Ele sai das buscas e não recebe pedidos novos; as locações em andamento continuam.'
        : gravado?.status === 'rented'
          ? 'Anúncio retomado. Ele aparece como lotado enquanto não houver vaga livre.'
          : 'Anúncio de volta ao ar.',
  };
}

// ---------------------------------------------------------------------------
// Excluir
// ---------------------------------------------------------------------------

/**
 * Exclusao.
 *
 * Rascunho sem historico some de verdade. Anuncio com reserva vira arquivado
 * (soft delete): apagar de vez levaria junto o registro de pagamentos,
 * disputas e auditoria de gente que confiou na plataforma.
 */
export async function deleteSpaceAction(
  _prev: SpaceActionState | undefined,
  formData: FormData,
): Promise<SpaceActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');
  try {
    // Só a posse importa aqui: o anúncio de outra pessoa não existe para quem pede.
    await getOwnedSpace(spaceId, user.id);
  } catch {
    return { ok: false, message: 'Anúncio não encontrado.' };
  }

  // Locação em andamento (ou pedido ainda sem resposta) trava a exclusão e o arquivamento:
  // quem aluga não pode perder o espaço por baixo. O proprietário responde os pedidos e
  // espera ou pede o encerramento das locações antes.
  const [{ vivas } = { vivas: 0 }] = await db
    .select({ vivas: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.spaceId, spaceId), inArray(bookings.status, [...LIVE_STATUSES])));
  if (vivas > 0) {
    return {
      ok: false,
      message: `Este anúncio tem ${vivas} ${vivas === 1 ? 'locação ou solicitação em andamento' : 'locações ou solicitações em andamento'}. Responda os pedidos e aguarde o fim das locações (ou peça o encerramento) antes de excluir.`,
    };
  }

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(bookings.spaceId, spaceId));

  if (total > 0) {
    await db
      .update(spaces)
      .set({ status: 'archived', deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id)));

    await db.insert(auditLogs).values({
      actorId: user.id,
      actorRole: user.role,
      action: 'space.archived',
      entityType: 'space',
      entityId: spaceId,
      metadata: { reason: 'possui histórico de reservas', bookings: total },
    });

    revalidatePath('/meus-espacos');
    return {
      ok: true,
      message: 'Anúncio arquivado. O histórico de reservas foi preservado por obrigação legal.',
    };
  }

  await db.delete(spaces).where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id)));

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'space.deleted',
    entityType: 'space',
    entityId: spaceId,
  });

  revalidatePath('/meus-espacos');
  return { ok: true, message: 'Anúncio excluído.' };
}
