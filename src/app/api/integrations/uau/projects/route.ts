import { requireRole,toErrorResponse } from '@/lib/auth/account';
import { loadProjectCatalog } from '@/lib/collections/project-catalog';
import { UauError } from '@/lib/uau/client';
import { checkRateLimit,rateLimitResponse } from '@/lib/rate-limit';
export async function GET(){try{const {accountId}=await requireRole('admin');const rate=checkRateLimit(`uau:projects:${accountId}`,{limit:120,windowMs:60000});if(!rate.success)return rateLimitResponse(rate);return Response.json(await loadProjectCatalog(accountId),{headers:{'Cache-Control':'no-store'}});}catch(error){if(error instanceof UauError)return Response.json({error:error.message},{status:502});return toErrorResponse(error);}}
