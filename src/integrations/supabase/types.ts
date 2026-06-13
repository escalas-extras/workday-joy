export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          acao: string
          campo: string | null
          criado_em: string
          id: string
          justificativa: string | null
          registro_id: string
          tabela: string
          usuario_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao: string
          campo?: string | null
          criado_em?: string
          id?: string
          justificativa?: string | null
          registro_id: string
          tabela: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo?: string | null
          criado_em?: string
          id?: string
          justificativa?: string | null
          registro_id?: string
          tabela?: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      cliente_empresas: {
        Row: {
          cliente_id: string
          created_at: string
          empresa_id: string
          id: string
          situacao: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          empresa_id: string
          id?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          empresa_id?: string
          id?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_empresas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          nome_fantasia: string
          observacoes: string | null
          razao_social: string
          situacao: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          nome_fantasia: string
          observacoes?: string | null
          razao_social: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          nome_fantasia?: string
          observacoes?: string | null
          razao_social?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          codigo_ponto: string | null
          created_at: string
          empresa_id: string
          funcao_id: string
          id: string
          matricula: string
          nome: string
          situacao: Database["public"]["Enums"]["entity_status"]
          ultima_sincronizacao_ponto: string | null
          updated_at: string
        }
        Insert: {
          codigo_ponto?: string | null
          created_at?: string
          empresa_id: string
          funcao_id: string
          id?: string
          matricula: string
          nome: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          ultima_sincronizacao_ponto?: string | null
          updated_at?: string
        }
        Update: {
          codigo_ponto?: string | null
          created_at?: string
          empresa_id?: string
          funcao_id?: string
          id?: string
          matricula?: string
          nome?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          ultima_sincronizacao_ponto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          created_at: string
          id: string
          nome: string
          situacao: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      extras: {
        Row: {
          aprovado_financeiro_em: string | null
          aprovado_financeiro_por: string | null
          aprovado_operacional_em: string | null
          aprovado_operacional_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          classificacao_comercial: Database["public"]["Enums"]["classificacao_comercial"]
          cliente_id: string
          colaborador_id: string
          comprovante_url: string | null
          created_at: string
          created_by: string | null
          data: string
          data_pagamento: string | null
          emitente_id: string
          empresa_id: string | null
          faturado_em: string | null
          faturado_por: string | null
          fechado_em: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          funcao_id: string
          hora_inicio: string
          hora_termino: string
          id: string
          justificativa_alteracao: string | null
          justificativa_cancelamento: string | null
          lote_pagamento_id: string | null
          motivo: string | null
          motivo_rejeicao_descricao: string | null
          motivo_rejeicao_id: string | null
          observacoes: string | null
          pago_em: string | null
          pago_por: string | null
          semana_ref: string
          situacao_financeira:
            | Database["public"]["Enums"]["situacao_financeira"]
            | null
          situacao_servico: Database["public"]["Enums"]["situacao_servico"]
          status: Database["public"]["Enums"]["extra_status"]
          updated_at: string
          updated_by: string | null
          valor: number
          valor_faturamento: number | null
        }
        Insert: {
          aprovado_financeiro_em?: string | null
          aprovado_financeiro_por?: string | null
          aprovado_operacional_em?: string | null
          aprovado_operacional_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          classificacao_comercial?: Database["public"]["Enums"]["classificacao_comercial"]
          cliente_id: string
          colaborador_id: string
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          data_pagamento?: string | null
          emitente_id: string
          empresa_id?: string | null
          faturado_em?: string | null
          faturado_por?: string | null
          fechado_em?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          funcao_id: string
          hora_inicio: string
          hora_termino: string
          id?: string
          justificativa_alteracao?: string | null
          justificativa_cancelamento?: string | null
          lote_pagamento_id?: string | null
          motivo?: string | null
          motivo_rejeicao_descricao?: string | null
          motivo_rejeicao_id?: string | null
          observacoes?: string | null
          pago_em?: string | null
          pago_por?: string | null
          semana_ref: string
          situacao_financeira?:
            | Database["public"]["Enums"]["situacao_financeira"]
            | null
          situacao_servico: Database["public"]["Enums"]["situacao_servico"]
          status?: Database["public"]["Enums"]["extra_status"]
          updated_at?: string
          updated_by?: string | null
          valor: number
          valor_faturamento?: number | null
        }
        Update: {
          aprovado_financeiro_em?: string | null
          aprovado_financeiro_por?: string | null
          aprovado_operacional_em?: string | null
          aprovado_operacional_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          classificacao_comercial?: Database["public"]["Enums"]["classificacao_comercial"]
          cliente_id?: string
          colaborador_id?: string
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          data_pagamento?: string | null
          emitente_id?: string
          empresa_id?: string | null
          faturado_em?: string | null
          faturado_por?: string | null
          fechado_em?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          funcao_id?: string
          hora_inicio?: string
          hora_termino?: string
          id?: string
          justificativa_alteracao?: string | null
          justificativa_cancelamento?: string | null
          lote_pagamento_id?: string | null
          motivo?: string | null
          motivo_rejeicao_descricao?: string | null
          motivo_rejeicao_id?: string | null
          observacoes?: string | null
          pago_em?: string | null
          pago_por?: string | null
          semana_ref?: string
          situacao_financeira?:
            | Database["public"]["Enums"]["situacao_financeira"]
            | null
          situacao_servico?: Database["public"]["Enums"]["situacao_servico"]
          status?: Database["public"]["Enums"]["extra_status"]
          updated_at?: string
          updated_by?: string | null
          valor?: number
          valor_faturamento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "extras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_motivo_rejeicao_id_fkey"
            columns: ["motivo_rejeicao_id"]
            isOneToOne: false
            referencedRelation: "motivos_rejeicao"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos_semanais: {
        Row: {
          created_at: string
          encerrado_financeiro: boolean
          encerrado_financeiro_em: string | null
          encerrado_financeiro_por: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          motivo_reabertura: string | null
          reaberto_em: string | null
          reaberto_por: string | null
          semana_ref: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encerrado_financeiro?: boolean
          encerrado_financeiro_em?: string | null
          encerrado_financeiro_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          semana_ref: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encerrado_financeiro?: boolean
          encerrado_financeiro_em?: string | null
          encerrado_financeiro_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          semana_ref?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      funcoes: {
        Row: {
          created_at: string
          id: string
          nome: string
          situacao: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      motivos_rejeicao: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          id?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      recibos: {
        Row: {
          assinatura_url: string | null
          ativo: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          colaborador_id: string
          created_at: string
          data_pagamento: string
          gerado_em: string
          gerado_por: string
          id: string
          motivo_cancelamento: string | null
          numero: number
          semana_ref: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          assinatura_url?: string | null
          ativo?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id: string
          created_at?: string
          data_pagamento: string
          gerado_em?: string
          gerado_por: string
          id?: string
          motivo_cancelamento?: string | null
          numero?: number
          semana_ref: string
          updated_at?: string
          valor_total: number
        }
        Update: {
          assinatura_url?: string | null
          ativo?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id?: string
          created_at?: string
          data_pagamento?: string
          gerado_em?: string
          gerado_por?: string
          id?: string
          motivo_cancelamento?: string | null
          numero?: number
          semana_ref?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "recibos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos_itens: {
        Row: {
          extra_id: string
          id: string
          recibo_id: string
          valor_snapshot: number
        }
        Insert: {
          extra_id: string
          id?: string
          recibo_id: string
          valor_snapshot: number
        }
        Update: {
          extra_id?: string
          id?: string
          recibo_id?: string
          valor_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "recibos_itens_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_itens_recibo_id_fkey"
            columns: ["recibo_id"]
            isOneToOne: false
            referencedRelation: "recibos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_gestor: { Args: { _user_id: string }; Returns: boolean }
      normalize_text: { Args: { t: string }; Returns: string }
      proximo_numero_recibo: { Args: never; Returns: number }
      semana_ref_de: { Args: { ts: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "gestor_operacional"
        | "gestor_financeiro"
        | "supervisor"
      classificacao_comercial: "contrato" | "a_cobrar"
      entity_status: "ativo" | "inativo"
      extra_status:
        | "pendente"
        | "aprovado_operacional"
        | "rejeitado"
        | "aprovado_financeiro"
      forma_pagamento: "pix" | "dinheiro" | "transferencia" | "conta_corrente"
      situacao_financeira:
        | "pendente_pagamento"
        | "pago"
        | "faturado"
        | "cancelado"
      situacao_servico:
        | "contrato"
        | "cobertura_ferias"
        | "cobertura_atestado"
        | "evento"
        | "apoio_operacional"
        | "outro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "gestor_operacional",
        "gestor_financeiro",
        "supervisor",
      ],
      classificacao_comercial: ["contrato", "a_cobrar"],
      entity_status: ["ativo", "inativo"],
      extra_status: [
        "pendente",
        "aprovado_operacional",
        "rejeitado",
        "aprovado_financeiro",
      ],
      forma_pagamento: ["pix", "dinheiro", "transferencia", "conta_corrente"],
      situacao_financeira: [
        "pendente_pagamento",
        "pago",
        "faturado",
        "cancelado",
      ],
      situacao_servico: [
        "contrato",
        "cobertura_ferias",
        "cobertura_atestado",
        "evento",
        "apoio_operacional",
        "outro",
      ],
    },
  },
} as const
