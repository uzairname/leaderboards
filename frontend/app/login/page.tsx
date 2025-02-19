import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex justify-center items-start md:items-center p-8">
      <Card className="w-full max-w-sm">
        {/* <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
        </CardHeader> */}
        <CardDescription>
          <form
            action={async () => {
              'use server';
              await signIn('discord', {
                redirectTo: '/'
              });
            }}
            className="w-full"
          >
            <Button className="w-full">Sign in with Discord</Button>
          </form>
        </CardDescription>
      </Card>
    </div>
  );
}
