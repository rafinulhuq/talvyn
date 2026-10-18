"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CreateUserForm } from "@/components/admin/CreateUserForm";

export function AddAdminSection() {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  if (showForm) {
    return (
      <CreateUserForm
        onCreated={() => {
          setShowForm(false);
          router.refresh();
        }}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  return (
    <div className="mb-6 flex justify-end">
      <Button size="sm" leftIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setShowForm(true)}>
        Add admin
      </Button>
    </div>
  );
}
