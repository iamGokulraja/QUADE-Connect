// Tiny dependency-free toasts. Call toast.success / toast.error anywhere; <ToastHost/> renders them.
const send = (type, message) => window.dispatchEvent(new CustomEvent("qc-toast", { detail: { type, message } }));
const toast = { success: (m) => send("success", m), error: (m) => send("error", m) };
export default toast;
