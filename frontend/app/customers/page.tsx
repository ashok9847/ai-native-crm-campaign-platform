"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listCustomers, listCrmFields, isAuthenticated } from "@/lib/api";
import type { CustomerResponse, CRMFieldResponse } from "@/lib/types";
import CsvImporter from "@/components/campaign/CsvImporter";
import PageWrapper from "@/components/layout/PageWrapper";
import { Loader, Sparkles, ChevronDown, Tag, Coffee } from "lucide-react";

const TIER_BADGES: Record<string, string> = {
  starter: "badge-pending",
  premium: "badge-amber",
  elite: "bg-text text-white px-3 py-1 rounded-pill text-xs font-bold border-none uppercase tracking-wider inline-flex items-center gap-1 shrink-0",
};

export default function CustomersPage() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [crmFields, setCrmFields] = useState<CRMFieldResponse[]>([]);
  const [isSchemaExpanded, setIsSchemaExpanded] = useState(false);

  // Authenticated route guard
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      setIsAuthChecking(false);
    }
  }, [router]);

  const fetchCustomersList = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listCustomers(1, 50);
      setCustomers(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCrmFieldsList = useCallback(async () => {
    try {
      const fields = await listCrmFields();
      setCrmFields(fields);
    } catch (err) {
      console.error("Failed to fetch CRM fields:", err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthChecking) {
      fetchCustomersList();
      fetchCrmFieldsList();
    }
  }, [isAuthChecking, fetchCustomersList, fetchCrmFieldsList]);

  const handleImportSuccess = () => {
    fetchCustomersList();
    fetchCrmFieldsList();
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-muted font-bold text-xs uppercase tracking-wider">
          <Loader className="w-5 h-5 animate-spin text-accent" />
          Verifying credentials…
        </div>
      </div>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setIsSchemaExpanded(!isSchemaExpanded)}
        className="btn-ghost flex items-center gap-1.5 h-10 px-4"
      >
        <Sparkles className="w-4 h-4 text-accent" />
        <span>Workspace Schema</span>
        {crmFields.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-text/10 text-xs font-mono font-bold text-text">
            {crmFields.length}
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-text-muted transition-transform duration-200 ${
            isSchemaExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <CsvImporter onSuccess={handleImportSuccess} />
    </div>
  );

  return (
    <PageWrapper
      title="Customers"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Customers" }
      ]}
      actions={headerActions}
    >
      <div className="space-y-6">
        
        {/* Collapsible Workspace Schema Accordion */}
        {isSchemaExpanded && (
          <div className="rounded-[18px] bg-surface p-6 border-none shadow-none relative overflow-hidden animate-slideInUp">
            <h2 className="text-xs font-extrabold text-text mb-1 flex items-center gap-1.5 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Inferred CRM Schema Definitions
            </h2>
            <p className="text-xs text-text-muted mb-5 leading-relaxed font-semibold">
              Dynamically inferred fields automatically mapped by AI profiling from CSV uploads. These fields are immediately available for natural-language campaign segmentation.
            </p>

            {crmFields.length === 0 ? (
              <div className="py-8 text-center border-none rounded-[18px] bg-white">
                <Tag className="w-8 h-8 text-text-faint mx-auto mb-2" />
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider">No custom fields defined yet</p>
                <p className="text-xs text-text-faint mt-1 max-w-xs mx-auto leading-relaxed font-semibold">
                  Import a CSV file with custom headers to trigger automated AI inference.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {crmFields.map((field) => (
                  <div
                    key={field.id}
                    className="p-4 rounded-[18px] bg-white border-none shadow-none flex flex-col justify-between animate-slideInUp hover:scale-[1.01] hover:shadow-[0_8px_30px_rgb(0,0,0,0.01)] transition-all duration-300 ease-out"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                        <span className="text-xs font-bold font-mono text-accent bg-accent-light px-2.5 py-0.5 rounded-pill">
                          {field.field_name}
                        </span>
                        <span className="badge-pending text-xs px-2 py-0.5 font-bold uppercase shrink-0">
                          {field.field_type}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted leading-relaxed font-semibold">
                        {field.description || "No description generated."}
                      </p>
                    </div>

                    {field.allowed_enums && field.allowed_enums.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-bold text-text-faint uppercase tracking-wider mb-1.5">
                          Allowed Enums
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {field.allowed_enums.map((val) => (
                            <span
                              key={val}
                              className="px-2 py-0.5 rounded-pill bg-surface text-xs font-bold text-text-muted uppercase"
                            >
                              {val}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading overlay / Table */}
        {isLoading && customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 rounded-[18px] bg-surface">
            <Loader className="w-8 h-8 text-accent animate-spin mb-4" />
            <span className="text-text-muted font-bold text-xs uppercase tracking-wider">Loading customers...</span>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 rounded-[18px] bg-surface border-none shadow-none text-center">
            <Coffee className="w-12 h-12 text-text-faint mx-auto mb-4" />
            <h2 className="text-lg font-bold text-text mb-1">No customers yet</h2>
            <p className="text-text-muted text-xs font-semibold mb-6">
              Import a CSV file to load customer demographics and order data.
            </p>
          </div>
        ) : (
          <div className="rounded-[18px] bg-surface overflow-hidden border-none shadow-none relative">
            {isLoading && (
              <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center z-10">
                <Loader className="w-6 h-6 text-accent animate-spin" />
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="global-table">
                <thead className="global-table-thead">
                  <tr>
                    <th className="global-table-th">Name</th>
                    <th className="global-table-th">Email</th>
                    <th className="global-table-th">Tier</th>
                    <th className="global-table-th">Roast</th>
                    <th className="global-table-th">City</th>
                    <th className="global-table-th">Custom Fields</th>
                    <th className="global-table-th">Last Order</th>
                    <th className="global-table-th text-right">LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className="global-table-tr"
                    >
                      <td className="global-table-td font-bold text-text">{c.name}</td>
                      <td className="global-table-td text-text-muted font-semibold">{c.email}</td>
                      <td className="global-table-td">
                        <span className={TIER_BADGES[c.subscription_tier] || "badge-pending"}>
                          {c.subscription_tier}
                        </span>
                      </td>
                      <td className="global-table-td text-text-muted font-semibold capitalize">
                        {c.roast_preference}
                      </td>
                      <td className="global-table-td text-text-muted font-semibold">{c.city}</td>
                      <td className="global-table-td">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {Object.entries(c.metadata || {}).map(([key, val]) => (
                            <span
                              key={key}
                              className="inline-flex items-center px-2 py-0.5 rounded-pill bg-accent-light text-accent text-xs font-bold uppercase tracking-wider"
                            >
                              {key.replace(/_/g, " ")}: {String(val)}
                            </span>
                          ))}
                          {(!c.metadata || Object.keys(c.metadata).length === 0) && (
                            <span className="text-text-faint text-xs font-bold uppercase">—</span>
                          )}
                        </div>
                      </td>
                      <td className="global-table-td text-text-muted font-semibold">
                        {new Date(c.last_order_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="global-table-td text-right font-mono text-xs text-green font-extrabold">
                        ₹{c.lifetime_value.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > customers.length && (
              <div className="px-6 py-4 text-xs font-bold text-text-muted text-center uppercase tracking-wider bg-white border-t border-border">
                Showing {customers.length} of {total} customers
              </div>
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
