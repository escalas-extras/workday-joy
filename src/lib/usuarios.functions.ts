import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "admin" | "gestor_operacional" | "gestor_financeiro" | "supervisor";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Apenas administradores podem executar esta ação");
}

async function audit(
  supabaseAdmin: any,
  params: { tabela: string; registro_id: string; usuario_id: string; acao: string; valor_novo?: any; justificativa?: string },
) {
  await supabaseAdmin.from("auditoria").insert({
    tabela: params.tabela,
    registro_id: params.registro_id,
    usuario_id: params.usuario_id,
    acao: params.acao,
    valor_novo: params.valor_novo ? JSON.stringify(params.valor_novo) : null,
    justificativa: params.justificativa ?? null,
  });
}

export const listUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const { data: profiles } = await supabaseAdmin.from("profiles").select("*");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    return users.users.map((u) => {
      const p = profiles?.find((x: any) => x.id === u.id);
      const userRoles = (roles ?? []).filter((r: any) => r.user_id === u.id).map((r: any) => r.role as AppRole);
      return {
        id: u.id,
        email: u.email ?? "",
        nome: p?.nome ?? u.email ?? "",
        ativo: p?.ativo ?? true,
        roles: userRoles,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed_at: (u as any).confirmed_at ?? u.email_confirmed_at ?? null,
      };
    });
  });

export const inviteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; nome: string; roles: AppRole[]; redirectTo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { nome: data.nome },
      redirectTo: data.redirectTo,
    });
    if (error) throw error;
    const newId = invited.user!.id;
    // garante profile com nome atualizado (trigger handle_new_user já cria)
    await supabaseAdmin.from("profiles").upsert({ id: newId, nome: data.nome, email: data.email });
    if (data.roles.length) {
      await supabaseAdmin.from("user_roles").insert(data.roles.map((r) => ({ user_id: newId, role: r })));
    }
    await audit(supabaseAdmin, {
      tabela: "profiles",
      registro_id: newId,
      usuario_id: context.userId,
      acao: "INVITE",
      valor_novo: { email: data.email, nome: data.nome, roles: data.roles },
      justificativa: `Convite de ativação enviado para ${data.email}`,
    });
    return { id: newId };
  });

export const updateUsuarioRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; roles: AppRole[] }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (data.roles.length) {
      await supabaseAdmin.from("user_roles").insert(data.roles.map((r) => ({ user_id: data.userId, role: r })));
    }
    await audit(supabaseAdmin, {
      tabela: "user_roles",
      registro_id: data.userId,
      usuario_id: context.userId,
      acao: "UPDATE",
      valor_novo: { roles: data.roles },
      justificativa: "Atualização de papéis",
    });
    return { ok: true };
  });

export const setUsuarioAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; ativo: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ ativo: data.ativo }).eq("id", data.userId);
    if (!data.ativo) {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876600h" });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" });
    }
    return { ok: true };
  });

export const sendPasswordResetByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; email: string; redirectTo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Usa o fluxo padrão do Supabase: gera link de recuperação enviado por e-mail
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw error;
    await audit(supabaseAdmin, {
      tabela: "profiles",
      registro_id: data.userId,
      usuario_id: context.userId,
      acao: "PASSWORD_RESET_REQUEST",
      valor_novo: { email: data.email, origem: "admin" },
      justificativa: `Administrador solicitou redefinição de senha para ${data.email}`,
    });
    return { ok: true };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; email: string; redirectTo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw error;
    await audit(supabaseAdmin, {
      tabela: "profiles",
      registro_id: data.userId,
      usuario_id: context.userId,
      acao: "INVITE_RESEND",
      valor_novo: { email: data.email },
      justificativa: `Reenvio de convite de ativação para ${data.email}`,
    });
    return { ok: true };
  });

export const logPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await audit(supabaseAdmin, {
      tabela: "profiles",
      registro_id: context.userId,
      usuario_id: context.userId,
      acao: "PASSWORD_CHANGE",
      valor_novo: { at: new Date().toISOString() },
      justificativa: "Usuário alterou a própria senha",
    });
    return { ok: true };
  });

export const deleteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir o próprio usuário");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Buscar dados antes de excluir para auditoria
    const { data: prof } = await supabaseAdmin.from("profiles").select("nome,email").eq("id", data.userId).maybeSingle();
    // Registra auditoria ANTES da exclusão (após o delete o id deixa de existir)
    await audit(supabaseAdmin, {
      tabela: "profiles",
      registro_id: data.userId,
      usuario_id: context.userId,
      acao: "DELETE",
      valor_novo: { email: prof?.email, nome: prof?.nome },
      justificativa: `Usuário excluído permanentemente por ${context.userId}`,
    });
    // Remove papéis e profile (histórico em extras/auditoria/fechamentos mantém o uuid solto, sem FK)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });
