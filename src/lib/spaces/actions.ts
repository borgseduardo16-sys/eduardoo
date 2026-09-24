'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, spaceFeatures, features, auditLogs, bookings } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { parseBRLToCents, formatBRL } from '@/lib/money';
import { settingInt } from '@/lib/settings';
import { rateLimit } from '@/lib/rate-limit';
import { lookupCep } from '@/lib/maps/cep-lookup';
import { CepError, normalizeCep } from '@/lib/maps/cep';
import { getOwnedSpace, NotSpaceOwnerError, SpaceNotFoundError } from './queries';
import { buildSlug } from './slug';
import { SPACE_TYPES, type SpaceTypeKey } from './types';
import {
  typeStepSchema,
  locationStepSchema,
  featuresStepSchema,
  contentStepSchema,
  priceStepSchema,
  rulesStepSchema,
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
        priceMonthlyCents: 1, // placeholder: o CHECK do banco exige > 0 desde o insert
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

  // Anuncio alugado nao aceita edicao livre: mexer em preco, endereco ou
  // metragem quebraria o contrato vigente de quem ja esta usando o espaco.
  if (space.status === 'rented' && step !== 'regras' && step !== 'descricao') {
    return {
      ok: false,
      message:
        'Este espaço está alugado. Enquanto a locação estiver ativa, só é possível editar a descrição e as regras.',
    };
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  let nextStep = space.draftStep;

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
      const raw = String(formData.get('price') ?? '');
      let cents: number;
      try {
        cents = parseBRLToCents(raw);
      } catch {
        return { ok: false, fieldErrors: { price: ['Valor inválido. Exemplo: 180,00'] } };
      }

      const parsed = priceStepSchema.safeParse({
        priceMonthlyCents: cents,
        availableFrom: formData.get('availableFrom'),
      });
      if (!parsed.success) {
        const errs = fieldErrors(parsed.error);
        // O campo do formulario chama "price"; o schema chama priceMonthlyCents.
        if (errs.priceMonthlyCents) errs.price = errs.priceMonthlyCents;
        return { ok: false, fieldErrors: errs };
      }

      const minRent = await settingInt('booking.min_rent_cents', 3500);
      if (cents < minRent) {
        return {
          ok: false,
          fieldErrors: {
            price: [`O valor mínimo aceito é ${formatBRL(minRent)} por mês.`],
          },
        };
      }

      Object.assign(patch, {
        priceMonthlyCents: parsed.data.priceMonthlyCents,
        availableFrom: parsed.data.availableFrom,
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
      });
      if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

      Object.assign(patch, {
        allowedItems: parsed.data.allowedItems || null,
        forbiddenItems: parsed.data.forbiddenItems || null,
        accessHours: parsed.data.accessHours || null,
        rulesText: parsed.data.rulesText || null,
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
  await db.update(spaces).set(patch).where(eq(spaces.id, spaceId));

  revalidatePath(`/anunciar/${spaceId}`, 'layout');
  revalidatePath('/meus-espacos');

  return { ok: true, spaceId };
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

  const minRent = await settingInt('booking.min_rent_cents', 3500);
  if (!space.priceMonthlyCents || space.priceMonthlyCents < minRent) {
    faltando.push(`preço de pelo menos ${formatBRL(minRent)}`);
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
    const msg = err instanceof Error ? err.message : '';
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

  if (space.status === 'rented') {
    return {
      ok: false,
      message: 'Não é possível pausar um espaço alugado. Encerre a locação primeiro.',
    };
  }

  const novo = space.status === 'published' ? 'paused' : 'published';

  if (novo === 'published' && !space.publishedAt) {
    return { ok: false, message: 'Este anúncio ainda não foi publicado.' };
  }

  await db
    .update(spaces)
    .set({ status: novo, updatedAt: new Date() })
    .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id)));

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: novo === 'paused' ? 'space.paused' : 'space.resumed',
    entityType: 'space',
    entityId: spaceId,
  });

  revalidatePath('/meus-espacos');
  revalidatePath('/espacos');
  return {
    ok: true,
    message: novo === 'paused' ? 'Anúncio pausado.' : 'Anúncio de volta ao ar.',
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
  let space;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch {
    return { ok: false, message: 'Anúncio não encontrado.' };
  }

  if (space.status === 'rented') {
    return { ok: false, message: 'Não é possível excluir um espaço alugado.' };
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
