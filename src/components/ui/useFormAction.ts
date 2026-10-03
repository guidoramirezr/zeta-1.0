"use client";

import { useTransition } from "react";

// Envía un formulario a una Server Action SIN que React lo vacíe al terminar
// (así, si hay un error o hay que confirmar algo, no se pierde lo escrito).
export function useFormSubmit(action: (fd: FormData) => void) {
  const [, startTransition] = useTransition();
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(fd));
  };
}
