import 'server-only';
import * as XLSX from 'xlsx';
import type { LeadRow } from './queries';

const NAO_ENCONTRADO = 'Não encontrado';

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato_realizado: 'Contato realizado',
  em_negociacao: 'Em negociação',
  cliente: 'Cliente',
  sem_interesse: 'Sem interesse',
};

function fmt(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return NAO_ENCONTRADO;
  return String(value);
}

/**
 * Linhas prontas para exportacao — so campos realmente encontrados.
 * Nunca preenche nada que nao veio da Places API.
 */
function toExportRows(leads: LeadRow[]) {
  return leads.map((lead) => ({
    Empresa: fmt(lead.name),
    Categoria: fmt(lead.category),
    Cidade: fmt(lead.city),
    Estado: fmt(lead.state),
    Endereço: fmt(lead.address),
    Nota: lead.rating ? Number(lead.rating).toFixed(1) : NAO_ENCONTRADO,
    Avaliações: fmt(lead.reviewCount),
    Telefone: fmt(lead.phone),
    WhatsApp: fmt(lead.whatsappUrl),
    Instagram: fmt(lead.instagramUrl),
    'Google Maps': fmt(lead.mapsUrl),
    'Status da presença digital':
      lead.leadStatus === 'valid'
        ? lead.confidence === 'verificacao_recomendada'
          ? 'Sem site identificado (verificação recomendada)'
          : 'Sem site identificado'
        : `Descartada: ${fmt(lead.discardReason)}`,
    'Status do lead': lead.savedStatus ? STATUS_LABELS[lead.savedStatus] ?? lead.savedStatus : NAO_ENCONTRADO,
    Observações: fmt(lead.notes),
  }));
}

function csvEscape(value: string): string {
  if (/[",;\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildLeadsCsv(leads: LeadRow[]): string {
  const rows = toExportRows(leads);
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(String(row[h as keyof typeof row]))).join(',')),
  ];
  // BOM para o Excel abrir acentuacao em UTF-8 corretamente.
  return '﻿' + lines.join('\r\n');
}

export function buildLeadsXlsx(leads: LeadRow[]): Buffer {
  const rows = toExportRows(leads);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
