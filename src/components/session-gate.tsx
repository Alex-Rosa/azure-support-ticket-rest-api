"use client";
// Shows sign-in / configuration problems before rendering scoped pages.
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/components/app-context";

export function SessionGate({ children }: { children: (scope: string) => React.ReactNode }) {
  const { session, sessionError, subscriptionsError, scope } = useApp();
  const pathname = usePathname();

  if (sessionError) return <ErrorAlert title="Could not reach the app server" message={sessionError} />;
  if (!session) return <Skeleton className="h-40 w-full" />;

  if (session.signInRequired) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Sign in to continue</h1>
        <p className="text-sm text-muted-foreground">
          This app calls the Azure Support API with your own Azure permissions.
        </p>
        <Button
          nativeButton={false}
          render={<a href={`/api/auth/login?returnTo=${encodeURIComponent(pathname)}`} />}
        >
          Sign in with Microsoft
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {session.authWarning && <ErrorAlert title="Auth configuration" message={session.authWarning} />}
      {subscriptionsError && (
        <ErrorAlert
          title="Could not list subscriptions"
          message={`${subscriptionsError} Only the tenant scope is available.`}
        />
      )}
      {scope ? children(scope) : <Skeleton className="h-40 w-full" />}
    </div>
  );
}

export function ErrorAlert({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="whitespace-pre-line">{message}</AlertDescription>
    </Alert>
  );
}
