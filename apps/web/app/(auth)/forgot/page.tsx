import { ForgotClient } from "./ForgotClient";

export const metadata = { title: "Forgot your password" };

/** Its own key, like the other auth routes, so no state rides in from Sign in or Join. */
export default function Page() { return <ForgotClient key="forgot" />; }
