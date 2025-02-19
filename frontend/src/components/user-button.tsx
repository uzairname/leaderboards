import { auth } from "@/auth"
import { SignIn, SignOut } from "./signin"

export default async function UserButton() {
  const session = await auth()
  if (!session?.user) return <SignIn />

  return (
    <div className ="flex items-center gap-2">
        {session.user.name}
        <SignOut />
    </div>
  )
}
