import {NextRequest,NextResponse} from 'next/server';
export function proxy(request:NextRequest){
 const host=request.headers.get('host');
 if(process.env.LOCAL_WORKSPACE!=='1'||!host||!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return new NextResponse('This workspace is available on localhost only.',{status:403});
 const origin=request.headers.get('origin');
 if((origin&&origin!==`http://${host}`)||request.headers.get('sec-fetch-site')==='cross-site')return new NextResponse('Cross-origin access is not allowed.',{status:403});
 const response=NextResponse.next();
 if(request.nextUrl.pathname.startsWith('/api/'))response.headers.set('Cache-Control','no-store');
 return response;
}
