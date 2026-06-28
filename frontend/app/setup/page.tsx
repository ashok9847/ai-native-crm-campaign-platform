"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadCustomers, uploadOrders, seedMock, isAuthenticated } from "@/lib/api";
import { toast } from "sonner";

export default function SetupWizardPage() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [step, setStep] = useState<"choose" | "custom_customers" | "custom_orders" | "complete">("choose");
  
  // Custom upload states
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [isUploadingCustomers, setIsUploadingCustomers] = useState(false);
  const [isUploadingOrders, setIsUploadingOrders] = useState(false);
  const [isSeedingMock, setIsSeedingMock] = useState(false);
  
  // Results states
  const [importedCustomersCount, setImportedCustomersCount] = useState<number>(0);
  const [inferredFields, setInferredFields] = useState<Array<{ field_name: string; field_type: string }>>([]);
  const [importedOrdersCount, setImportedOrdersCount] = useState<number>(0);
  const [skippedOrdersCount, setSkippedOrdersCount] = useState<number>(0);
  const [skippedEmails, setSkippedEmails] = useState<string[]>([]);

  // Authenticated route guard
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      setIsAuthChecking(false);
    }
  }, [router]);

  const handleQuickSeed = async () => {
    setIsSeedingMock(true);
    try {
      const res = await seedMock();
      toast.success("Workspace seeded successfully!", {
        description: `Loaded ${res.customers_count} customers, ${res.orders_count} orders and ${res.crm_fields_count} CRM fields.`,
      });
      setImportedCustomersCount(res.customers_count);
      setImportedOrdersCount(res.orders_count);
      setStep("complete");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to seed workspace.", {
        description: err.message || "An error occurred during mock seeding.",
      });
    } finally {
      setIsSeedingMock(false);
    }
  };

  const handleCustomerUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerFile) return;

    setIsUploadingCustomers(true);
    try {
      const res = await uploadCustomers(customerFile);
      toast.success("Customers uploaded successfully!", {
        description: `Imported ${res.records_imported} customer profiles.`,
      });
      setImportedCustomersCount(res.records_imported);
      setInferredFields(res.new_fields_inferred);
      setStep("custom_orders");
    } catch (err: any) {
      console.error(err);
      toast.error("Customer upload failed.", {
        description: err.message || "Please check that your CSV is correctly formatted.",
      });
    } finally {
      setIsUploadingCustomers(false);
    }
  };

  const handleOrderUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderFile) return;

    setIsUploadingOrders(true);
    try {
      const res = await uploadOrders(orderFile);
      toast.success("Orders uploaded successfully!", {
        description: `Imported ${res.orders_count} order transactions.`,
      });
      setImportedOrdersCount(res.orders_count);
      setSkippedOrdersCount(res.skipped_count);
      setSkippedEmails(res.skipped_emails || []);
      setStep("complete");
    } catch (err: any) {
      console.error(err);
      toast.error("Order upload failed.", {
        description: err.message || "Please check that your CSV is correctly formatted.",
      });
    } finally {
      setIsUploadingOrders(false);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Verifying credentials...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-bg text-text flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Ambient backgrounds */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-10 left-10 w-[400px] h-[400px] rounded-full bg-accent-light/40 blur-[100px] animate-pulse" />
        <div className="absolute bottom-10 right-10 w-[500px] h-[500px] rounded-full bg-amber-light/60 blur-[120px] animate-pulse [animation-delay:2s]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black tracking-tight mb-2">Initialize Workspace</h1>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Set up your CRM database to start building targeted AI campaigns.
          </p>
        </div>

        {/* Wizard Container */}
        <div className="bg-white border border-border rounded-[18px] p-8 shadow-sm relative min-h-[400px] flex flex-col justify-between">
          
          {step === "choose" && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-text">How would you like to seed your workspace?</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Custom Card */}
                <button
                  onClick={() => setStep("custom_customers")}
                  className="flex flex-col items-center justify-between text-center p-6 rounded-[18px] border border-border bg-surface hover:border-accent/30 hover:bg-surface-hover transition-all duration-200 group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-accent-light flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-text mb-2">Import Custom CSV</h3>
                    <p className="text-text-muted text-xs px-2 leading-relaxed">
                      Upload your own customer database and sales transaction order logs.
                    </p>
                  </div>
                  <span className="mt-4 text-xs font-bold text-text">Begin Upload →</span>
                </button>

                {/* Quick Seed Card */}
                <button
                  onClick={handleQuickSeed}
                  disabled={isSeedingMock}
                  className="flex flex-col items-center justify-between text-center p-6 rounded-[18px] border border-border bg-surface hover:border-accent/30 hover:bg-surface-hover transition-all duration-200 group disabled:opacity-50 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-accent-light flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {isSeedingMock ? (
                      <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-6 h-6 text-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-text mb-2">Quick Seed Workspace</h3>
                    <p className="text-text-muted text-xs px-2 leading-relaxed">
                      Seed instantly with 9 mock coffee shop customers, order records, and CRM fields.
                    </p>
                  </div>
                  <span className="mt-4 text-xs font-bold text-text">
                    {isSeedingMock ? "Seeding..." : "One-Click Seed ⚡"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {step === "custom_customers" && (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Step 1 of 2</span>
                <h2 className="text-xl font-bold text-text mt-1 mb-2">Upload Customer Database</h2>
                <p className="text-text-muted text-xs leading-relaxed">
                  Prepare a CSV containing at least <code>name</code> and <code>email</code> columns.
                  Any other fields will be automatically inferred by our AI.
                </p>
              </div>

              <form onSubmit={handleCustomerUpload} className="space-y-6">
                <div className="border border-dashed border-border-strong rounded-[18px] p-8 bg-surface flex flex-col items-center justify-center relative hover:border-accent/30 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={(e) => setCustomerFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <svg className="w-8 h-8 text-text-faint mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-bold text-text">
                    {customerFile ? customerFile.name : "Select customers.csv file"}
                  </span>
                  <span className="text-xs text-text-faint mt-1">Click or drag & drop</span>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setStep("choose")}
                    className="btn-ghost"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={!customerFile || isUploadingCustomers}
                    className="btn-primary"
                  >
                    {isUploadingCustomers && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    <span>Upload Customers</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === "custom_orders" && (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Step 2 of 2</span>
                <h2 className="text-xl font-bold text-text mt-1 mb-2">Upload Sales History</h2>
                <p className="text-text-muted text-xs leading-relaxed">
                  Upload transaction logs CSV referencing customer email addresses. Unmapped records will be skipped.
                </p>
              </div>

              <form onSubmit={handleOrderUpload} className="space-y-6">
                <div className="border border-dashed border-border-strong rounded-[18px] p-8 bg-surface flex flex-col items-center justify-center relative hover:border-accent/30 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={(e) => setOrderFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <svg className="w-8 h-8 text-text-faint mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 00-2 2v2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <span className="text-sm font-bold text-text">
                    {orderFile ? orderFile.name : "Select orders.csv file"}
                  </span>
                  <span className="text-xs text-text-faint mt-1">Click or drag & drop</span>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setStep("complete")}
                    className="btn-ghost"
                  >
                    Skip Orders →
                  </button>
                  <button
                    type="submit"
                    disabled={!orderFile || isUploadingOrders}
                    className="btn-primary"
                  >
                    {isUploadingOrders && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    <span>Upload Orders</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === "complete" && (
            <div className="space-y-6">
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-light text-green flex items-center justify-center mx-auto mb-4 border border-green/20">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-text">Workspace Initialized!</h2>
                <p className="text-text-muted text-xs mt-1">Your data has been loaded and isolated in your database.</p>
              </div>

              {/* Summary Stats */}
              <div className="bg-surface border border-border rounded-[18px] p-6 space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Import Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white rounded-[18px] border border-border-strong">
                    <p className="text-[10px] text-text-muted font-bold uppercase">Customers</p>
                    <p className="text-2xl font-bold text-text">{importedCustomersCount}</p>
                  </div>
                  <div className="p-3 bg-white rounded-[18px] border border-border-strong">
                    <p className="text-[10px] text-text-muted font-bold uppercase">Orders</p>
                    <p className="text-2xl font-bold text-text">{importedOrdersCount}</p>
                  </div>
                </div>

                {/* Custom Fields List */}
                {inferredFields.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[10px] text-text-muted font-bold uppercase mb-2">Inferred CRM Schema Fields</p>
                    <div className="flex flex-wrap gap-2">
                      {inferredFields.map((f, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-full bg-accent-light border border-border-strong text-xs font-bold text-text">
                          {f.field_name} ({f.field_type})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skipped emails summary */}
                {skippedOrdersCount > 0 && (
                  <div className="pt-2 border-t border-border-strong">
                    <div className="flex items-center justify-between text-amber font-bold text-xs mb-2">
                      <span>⚠️ Skipped {skippedOrdersCount} orders (unmapped customers)</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto bg-white p-2.5 rounded-[18px] border border-border text-[11px] font-mono text-text-muted space-y-0.5">
                      {skippedEmails.map((email, idx) => (
                        <div key={idx}>{email}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-center pt-4">
                <button
                  onClick={() => router.push("/customers")}
                  className="btn-primary w-full"
                >
                  Go to Workspace
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

