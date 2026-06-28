"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { uploadCustomers, uploadOrders } from "@/lib/api";
import { toast } from "sonner";
import { Loader, X, UploadCloud, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

interface CsvImporterProps {
  onSuccess?: () => void;
}

export default function CsvImporter({ onSuccess }: CsvImporterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"customers" | "orders" | "complete">("customers");
  
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Result metrics
  const [importedCustomers, setImportedCustomers] = useState(0);
  const [importedOrders, setImportedOrders] = useState<number | null>(null);
  const [inferredFields, setInferredFields] = useState<Array<{ field_name: string; field_type: string }>>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    setStep("customers");
    setCustomerFile(null);
    setOrderFile(null);
    setIsUploading(false);
    setImportedCustomers(0);
    setImportedOrders(null);
    setInferredFields([]);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleCustomerUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerFile) return;

    setIsUploading(true);
    try {
      const res = await uploadCustomers(customerFile);
      setImportedCustomers(res.records_imported);
      setInferredFields(res.new_fields_inferred || []);
      toast.success(`${res.records_imported} customer profiles uploaded!`);
      setStep("orders");
    } catch (err: any) {
      toast.error(err.message || "Customer upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleOrderUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderFile) return;

    setIsUploading(true);
    try {
      const res = await uploadOrders(orderFile);
      setImportedOrders(res.orders_count);
      toast.success(`${res.orders_count} orders uploaded!`);
      setStep("complete");
    } catch (err: any) {
      toast.error(err.message || "Order upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      {/* Import CSV trigger button */}
      <button
        type="button"
        id="csv-import-btn"
        onClick={handleOpen}
        className="btn-primary h-10 px-5 shrink-0 border-none shadow-none cursor-pointer flex items-center justify-center"
      >
        Import CSV
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-border rounded-[18px] p-6 shadow-2xl max-w-md w-full relative space-y-5 animate-scaleUp text-text">
            
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-text-muted hover:text-text cursor-pointer p-1 rounded-full hover:bg-surface transition-colors border-none bg-transparent"
              title="Close importer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Title */}
            <div>
              <h3 className="text-sm font-black text-text uppercase tracking-wider">
                Import CSV Database
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-normal font-semibold">
                Setup your CRM database by uploading customer segments and sales transaction logs.
              </p>
            </div>

            {/* Mapped Data Notice Alert */}
            {step !== "complete" && (
              <div className="p-3.5 bg-amber-light text-[#92400E] rounded-[18px] border border-amber/15 text-xs font-semibold leading-relaxed flex items-start gap-2.5 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Important:</strong> Please upload <strong>mapped data</strong>. Ensure your order CSV records reference the exact same customer emails present in the customer CSV so they link correctly. Unmapped orders will be skipped.
                </p>
              </div>
            )}

            {/* Step 1: Customers */}
            {step === "customers" && (
              <form onSubmit={handleCustomerUpload} className="space-y-4">
                <div className="flex justify-between items-center text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  <span>Step 1 of 2</span>
                  <span>Customers CSV</span>
                </div>

                <div className="border border-dashed border-border-strong rounded-[18px] p-8 bg-surface flex flex-col items-center justify-center relative hover:border-accent/30 transition-colors cursor-pointer text-center">
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={(e) => setCustomerFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <UploadCloud className="w-8 h-8 text-text-faint mb-2" />
                  <span className="text-xs font-bold text-text">
                    {customerFile ? customerFile.name : "Select customers.csv file"}
                  </span>
                  <span className="text-[10px] text-text-faint mt-1">Click or drag & drop</span>
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="btn-ghost h-10 px-4"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!customerFile || isUploading}
                    className="btn-primary h-10 px-4"
                  >
                    {isUploading && <Loader className="w-3.5 h-3.5 animate-spin text-white" />}
                    <span>Upload Customers</span>
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Orders */}
            {step === "orders" && (
              <form onSubmit={handleOrderUpload} className="space-y-4">
                <div className="flex justify-between items-center text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  <span>Step 2 of 2</span>
                  <span>Orders CSV</span>
                </div>

                <div className="border border-dashed border-border-strong rounded-[18px] p-8 bg-surface flex flex-col items-center justify-center relative hover:border-accent/30 transition-colors cursor-pointer text-center">
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={(e) => setOrderFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <UploadCloud className="w-8 h-8 text-text-faint mb-2" />
                  <span className="text-xs font-bold text-text">
                    {orderFile ? orderFile.name : "Select orders.csv file"}
                  </span>
                  <span className="text-[10px] text-text-faint mt-1">Click or drag & drop</span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setStep("complete")}
                    className="btn-ghost h-10 px-4"
                  >
                    Skip Orders
                  </button>
                  <button
                    type="submit"
                    disabled={!orderFile || isUploading}
                    className="btn-primary h-10 px-4"
                  >
                    {isUploading && <Loader className="w-3.5 h-3.5 animate-spin text-white" />}
                    <span>Upload Orders</span>
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Complete */}
            {step === "complete" && (
              <div className="space-y-4">
                <div className="text-center py-3">
                  <div className="w-12 h-12 rounded-full bg-green-light text-green flex items-center justify-center mx-auto mb-3 border border-green/20">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-black text-text uppercase tracking-wider">Import Success!</h4>
                  <p className="text-xs text-text-muted mt-1 leading-normal font-semibold">Your data has been successfully imported into the workspace.</p>
                </div>

                {/* Import stats */}
                <div className="bg-surface border border-border rounded-[18px] p-4.5 space-y-3.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Import Summary</span>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="p-3 bg-white rounded-xl border border-border-strong text-center">
                      <span className="block text-[9px] text-text-muted font-bold uppercase">Customers</span>
                      <span className="block text-lg font-black text-text mt-0.5">{importedCustomers}</span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-border-strong text-center">
                      <span className="block text-[9px] text-text-muted font-bold uppercase">Orders</span>
                      <span className="block text-lg font-black text-text mt-0.5">
                        {importedOrders !== null ? importedOrders : "Skipped"}
                      </span>
                    </div>
                  </div>

                  {/* CRM schema inferred fields list */}
                  {inferredFields.length > 0 && (
                    <div className="pt-2 border-t border-border-strong">
                      <span className="block text-[9px] text-text-muted font-bold uppercase mb-2">Inferred CRM Schema</span>
                      <div className="flex flex-wrap gap-1.5">
                        {inferredFields.map((f, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-full bg-accent-light border border-border-strong text-[10px] font-bold text-text uppercase tracking-wider"
                          >
                            {f.field_name} ({f.field_type})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleClose}
                    className="btn-primary w-full h-11"
                  >
                    Finish & View Customers
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}
    </>
  );
}
