import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Drosophila | MaleCNS Research Studio',description:'Explore real fruit fly anatomy, inspect original MaleCNS neurons, and benchmark variants of measured neural circuits.',icons:{icon:[{url:'/favicon.svg?v=neural-fly',type:'image/svg+xml'},{url:'/favicon-32.png?v=neural-fly',sizes:'32x32',type:'image/png'}],shortcut:'/favicon.ico?v=neural-fly',apple:'/apple-touch-icon.png?v=neural-fly'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="dark"><body>{children}</body></html>}
