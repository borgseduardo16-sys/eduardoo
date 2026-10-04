import { CopyButton } from './live';

/**
 * Pix de uma cobrança que já existe: o QR e o "copia e cola" são
 * os que o Asaas devolveu — nunca montados aqui. A confirmação só chega pelo
 * webhook do Asaas; a tela em volta pergunta de novo ao servidor sozinha.
 */
export function PixCharge({ payload, qrImage }: { payload: string; qrImage: string | null }) {
  return (
    <div className="space-y-4">
      {qrImage && (
        // PNG em base64 vindo do Asaas.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${qrImage}`}
          alt="QR Code Pix para pagamento"
          width={220}
          height={220}
          className="mx-auto size-[220px] rounded-[var(--radius-field)] border bg-white p-2"
        />
      )}
      <div className="space-y-2">
        <p className="text-[0.8125rem] text-[var(--content-muted)]">Ou copie o código e cole no app do seu banco:</p>
        <p className="text-[0.75rem] font-mono break-all rounded-[var(--radius-field)] bg-[var(--surface-sunken)] p-3 select-all">
          {payload}
        </p>
        <CopyButton text={payload} />
      </div>
      <p className="flex items-center gap-2 text-[0.8125rem] text-[var(--content-muted)]" role="status">
        <span className="size-2 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
        Aguardando a confirmação do banco. Esta tela atualiza sozinha.
      </p>
    </div>
  );
}
