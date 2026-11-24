
import { useState } from "react";
import {
  UserPlus,
  User,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

function CreateUser() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "employee",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke("create-user", {
          body: {
            full_name: form.full_name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
          },
        });

      if (functionError) {
        let details = functionError.message;

        try {
          const response = await functionError.context?.json();
          if (response?.error) details = response.error;
        } catch {
          // Keep the original error message.
        }

        throw new Error(details);
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unable to create user.");
      }

      setMessage(
        `${data.user.full_name} was created successfully as ${data.user.role.replaceAll("_", " ")}.`
      );

      setForm({
        full_name: "",
        email: "",
        password: "",
        role: "employee",
      });

      setShowPassword(false);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-11 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

  return (
    <>
      <div className="min-h-full bg-slate-50 px-4 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl">

          {/* Page Heading */}
          <div className="mb-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <UserPlus size={27} />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Create New User
            </h1>

            <p className="mt-2 text-base text-slate-600">
              Add a new member to your organization and assign their role.
            </p>
          </div>

          {/* Success Message */}
          {message && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <CheckCircle2
                size={21}
                className="mt-0.5 shrink-0 text-green-600"
              />
              <div>
                <p className="font-semibold">Account Created Successfully</p>
                <p className="mt-1">{message}</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle
                size={21}
                className="mt-0.5 shrink-0 text-red-600"
              />
              <div>
                <p className="font-semibold">Account Creation Failed</p>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Main Form Card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">

            {/* Card Header */}
            <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-9">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <UserPlus size={20} />
                </div>

                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    User Information
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Enter the account details below.
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-9">

              {/* Full Name */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Full Name
                </label>

                <div className="relative">
                  <User
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="text"
                    name="full_name"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder="Enter full name"
                    required
                    maxLength={120}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Email Address
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Enter email address"
                    required
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Temporary Password
                </label>

                <div className="relative">
                  <LockKeyhole
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Enter password (minimum 8 characters)"
                    required
                    minLength={8}
                    className={`${inputClass} pr-12`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-blue-700"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Password must contain at least 8 characters.
                </p>
              </div>

              {/* Role Dropdown */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Select User Role
                </label>

                <div className="relative">
                  <ShieldCheck
                    size={19}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    required
                    className="w-full appearance-none rounded-xl border border-slate-300 bg-white py-3.5 pl-11 pr-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="employee">Employee</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="project_manager">
                      Project Manager
                    </option>
                    <option value="qc">QC (Quality Control)</option>
                    <option value="client">Client</option>
                  </select>

                  <ChevronDown
                    size={19}
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                  />
                </div>
              </div>

              {/* HR Permissions Information */}
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={21}
                    className="mt-0.5 shrink-0 text-blue-700"
                  />

                  <div>
                    <h3 className="text-sm font-bold text-blue-900">
                      HR Account Permissions
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-blue-800">
                      You can create Employee, Team Lead, Project Manager
                      and Client accounts. Admin and HR accounts can only
                      be created by Admin.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="border-t border-slate-100 pt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 font-semibold text-white shadow-md transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <UserPlus size={19} />
                      Create Account
                    </>
                  )}
                </button>

                <p className="mt-3 text-center text-xs text-slate-500">
                  The account will be created in your organization's
                  authentication system.
                </p>
              </div>
            </form>
          </div>

        </div>
      </div>
    </>
  );
}

export default CreateUser;
