import { NextRequest, NextResponse } from 'next/server';
import { requireUserOrThrow, UnauthorizedError } from '@/lib/auth/dal';
import { getSearchForUser, listLeadsForSearch, listSavedLeads } from '@/lib/prospecting/queries';
import { buildLeadsCsv, buildLeadsXlsx } from '@/lib/prospecting/export';

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Entre na sua conta para exportar.' }, { status: 401 });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  const scope = searchParams.get('scope');
  const searchId = searchParams.get('searchId');
  const status = searchParams.get('status');

  const leads = await (async () => {
    if (scope === 'saved') return listSavedLeads(user.id, status ? { statuses: [status] } : {});
    if (searchId) {
      const search = await getSearchForUser(user.id, searchId);
      if (!search) return null;
      return listLeadsForSearch(user.id, searchId);
    }
    return null;
  })();

  if (leads === null) {
    return NextResponse.json({ error: 'Nada para exportar — busca não encontrada.' }, { status: 404 });
  }

  const filename = `leads-${new Date().toISOString().slice(0, 10)}.${format}`;

  if (format === 'xlsx') {
    const buffer = new Uint8Array(buildLeadsXlsx(leads));
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const csv = buildLeadsCsv(leads);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
