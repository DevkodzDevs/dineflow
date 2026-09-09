import { AuthForm } from "../AuthForm";
import { login } from "../actions";
export default function Page() { return <AuthForm mode="login" action={login} />; }
