import { AuthForm } from "../AuthForm";
import { join } from "../actions";
export default function Page() { return <AuthForm mode="join" action={join} />; }
