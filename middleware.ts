export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/campaigns/:path*", "/integrations/:path*", "/logs/:path*"],
};
