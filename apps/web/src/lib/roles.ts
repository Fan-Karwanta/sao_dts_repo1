import {
  Calculator,
  CashRegister,
  FileMagnifyingGlass,
  IdentificationBadge,
  Package,
  SealCheck,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export interface RoleDescriptor {
  label: string;
  Icon: Icon;
}

const ROLE_DESCRIPTORS: Record<string, RoleDescriptor> = {
  admin: { label: "Administrator", Icon: ShieldCheck },
  sao: { label: "Supervising Administrative Officer", Icon: SealCheck },
  procurement_staff: { label: "Procurement Staff", Icon: ShoppingCart },
  budget_staff: { label: "Budget Staff", Icon: Wallet },
  supply_staff: { label: "Supply Staff", Icon: Package },
  pre_audit_staff: { label: "Pre-Audit Staff", Icon: FileMagnifyingGlass },
  accounting_staff: { label: "Accounting Staff", Icon: Calculator },
  cashier_staff: { label: "Cashier Staff", Icon: CashRegister },
};

export function roleDescriptor(key: string): RoleDescriptor {
  return (
    ROLE_DESCRIPTORS[key] ?? {
      label: key
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      Icon: IdentificationBadge,
    }
  );
}
