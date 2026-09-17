import { AuthForm } from "../AuthForm";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

/** The key keeps this route's form from inheriting state left behind by Join or Open a restaurant. */
export default function Page() { return <AuthForm key="login" mode="login" action={login} />; }
