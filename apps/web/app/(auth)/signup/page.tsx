import { AuthForm } from "../AuthForm";
import { signup } from "../actions";
export default function Page() { return <AuthForm mode="signup" action={signup} />; }
