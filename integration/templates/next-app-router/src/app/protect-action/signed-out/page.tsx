'use client';
import { logUserIdAction } from '@/app/protect-action/actions';
import { PageComponent } from '@/app/protect-action/page-component';

function Page() {
  // @ts-ignore
  return <PageComponent action={logUserIdAction} />;
}

export default Page;