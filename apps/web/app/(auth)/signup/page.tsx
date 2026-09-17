import { AuthForm } from "../AuthForm";
import { signup } from "../actions";

export const metadata = { title: "Open your property" };

/** The key keeps this route's form from inheriting state left behind by Sign in or Join. */
export default function Page() { return <AuthForm key="signup" mode="signup" action={signup} />; }
