
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = [
  "project_manager",
  "team_lead",
  "employee",
  "client",
  "qc",
];

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase server configuration is incomplete.");
    }

    // Verify the logged-in user.
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication required." }, 401);
    }

    const token = authorization.replace("Bearer ", "");

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !caller) {
      return jsonResponse({ error: "Invalid login session." }, 401);
    }

    // Use the service role only on the server.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Only active HR accounts can use this function.
    const { data: callerProfile, error: callerError } =
      await adminClient
        .from("profiles")
        .select("role, is_active")
        .eq("id", caller.id)
        .maybeSingle();

    if (callerError) throw callerError;

    if (
      !callerProfile ||
      callerProfile.role !== "hr" ||
      callerProfile.is_active !== true
    ) {
      return jsonResponse(
        { error: "Only active HR accounts can create these users." },
        403,
      );
    }

    const body = await req.json();

    const fullName =
      typeof body.full_name === "string" ? body.full_name.trim() : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    const role = typeof body.role === "string" ? body.role : "";

    if (!fullName || fullName.length > 120) {
      return jsonResponse({ error: "Enter a valid full name." }, 400);
    }

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }

    if (password.length < 8) {
      return jsonResponse(
        { error: "Password must contain at least 8 characters." },
        400,
      );
    }

    if (!allowedRoles.includes(role)) {
      return jsonResponse(
        { error: "You are not allowed to create this account role." },
        403,
      );
    }

    // Create the Auth account.
    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (createError) {
      return jsonResponse({ error: createError.message }, 400);
    }

    if (!createdUser.user) {
      throw new Error("Supabase did not return the created user.");
    }

    // The existing Auth trigger creates the profile with employee as default.
    // Update it with the selected role and full name.
    const { data: profile, error: profileError } =
      await adminClient
        .from("profiles")
        .update({
          full_name: fullName,
          email,
          role,
          is_active: true,
        })
        .eq("id", createdUser.user.id)
        .select("id, full_name, email, role, is_active")
        .single();

    if (profileError || !profile) {
      // Remove the Auth account if profile synchronization fails.
      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(createdUser.user.id);

      if (deleteError) {
        console.error("Auth cleanup failed:", deleteError.message);
      }

      throw new Error(
        profileError?.message || "User profile could not be synchronized.",
      );
    }

    return jsonResponse({
      success: true,
      message: "User account created successfully.",
      user: profile,
    });
  } catch (error) {
    console.error("Create user error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      500,
    );
  }
});
