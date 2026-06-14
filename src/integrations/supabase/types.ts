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
      almox_categorias: {
        Row: {
          id: string
          nome: string
          ordem: number
          tipo_tamanho: string
        }
        Insert: {
          id?: string
          nome: string
          ordem?: number
          tipo_tamanho: string
        }
        Update: {
          id?: string
          nome?: string
          ordem?: number
          tipo_tamanho?: string
        }
        Relationships: []
      }
      almox_devolucoes: {
        Row: {
          condicao: string
          created_at: string
          data: string
          entrega_id: string
          id: string
          observacao: string | null
          quantidade: number
          responsavel_id: string | null
          retorna_estoque: boolean
        }
        Insert: {
          condicao: string
          created_at?: string
          data?: string
          entrega_id: string
          id?: string
          observacao?: string | null
          quantidade: number
          responsavel_id?: string | null
          retorna_estoque?: boolean
        }
        Update: {
          condicao?: string
          created_at?: string
          data?: string
          entrega_id?: string
          id?: string
          observacao?: string | null
          quantidade?: number
          responsavel_id?: string | null
          retorna_estoque?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "almox_devolucoes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "almox_entregas"
            referencedColumns: ["id"]
          },
        ]
      }
      almox_entregas: {
        Row: {
          colaborador_id: string
          created_at: string
          data_entrega: string
          id: string
          item_id: string
          observacao: string | null
          quantidade: number
          quantidade_devolvida: number
          responsavel_id: string | null
          status: string
          tamanho: string | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_entrega?: string
          id?: string
          item_id: string
          observacao?: string | null
          quantidade: number
          quantidade_devolvida?: number
          responsavel_id?: string | null
          status?: string
          tamanho?: string | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_entrega?: string
          id?: string
          item_id?: string
          observacao?: string | null
          quantidade?: number
          quantidade_devolvida?: number
          responsavel_id?: string | null
          status?: string
          tamanho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almox_entregas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almox_entregas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
          },
          {
            foreignKeyName: "almox_entregas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "almox_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      almox_estoque: {
        Row: {
          ativo: boolean
          id: string
          item_id: string
          quantidade_atual: number
          quantidade_minima: number
          tamanho: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          id?: string
          item_id: string
          quantidade_atual?: number
          quantidade_minima?: number
          tamanho?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          id?: string
          item_id?: string
          quantidade_atual?: number
          quantidade_minima?: number
          tamanho?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "almox_estoque_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "almox_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      almox_itens: {
        Row: {
          ativo: boolean
          categoria_id: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "almox_itens_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "almox_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      almox_movimentacoes: {
        Row: {
          colaborador_id: string | null
          created_at: string
          entrega_id: string | null
          id: string
          item_id: string
          motivo: string
          observacao: string | null
          quantidade: number
          tamanho: string | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          colaborador_id?: string | null
          created_at?: string
          entrega_id?: string | null
          id?: string
          item_id: string
          motivo: string
          observacao?: string | null
          quantidade: number
          tamanho?: string | null
          tipo: string
          user_id?: string | null
        }
        Update: {
          colaborador_id?: string | null
          created_at?: string
          entrega_id?: string | null
          id?: string
          item_id?: string
          motivo?: string
          observacao?: string | null
          quantidade?: number
          tamanho?: string | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almox_movimentacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almox_movimentacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
          },
          {
            foreignKeyName: "almox_movimentacoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "almox_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_trail: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_trail_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
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
          cnpj: string | null
          created_at: string
          id: string
          nome_fantasia: string
          observacoes: string | null
          razao_social: string
          situacao: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_fantasia: string
          observacoes?: string | null
          razao_social: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
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
      colaborador_clientes: {
        Row: {
          cliente_id: string
          colaborador_id: string
          created_at: string
          id: string
          situacao: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          cliente_id: string
          colaborador_id: string
          created_at?: string
          id?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          colaborador_id?: string
          created_at?: string
          id?: string
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_clientes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_clientes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          codigo_ponto: string | null
          cpf: string | null
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
          cpf?: string | null
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
          cpf?: string | null
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
      digital_signatures: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          provider: string | null
          signature_hash: string | null
          signed_at: string | null
          signer_cpf: string | null
          signer_email: string | null
          signer_name: string
          signer_role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          provider?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name: string
          signer_role: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          provider?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string
          signer_role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      disciplinary_case_approvals: {
        Row: {
          active: boolean
          approved_by: string
          case_id: string
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          decision: string
          id: string
          observacao: string | null
          step: string
        }
        Insert: {
          active?: boolean
          approved_by: string
          case_id: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          decision: string
          id?: string
          observacao?: string | null
          step: string
        }
        Update: {
          active?: boolean
          approved_by?: string
          case_id?: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          decision?: string
          id?: string
          observacao?: string | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_case_approvals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_case_evidences: {
        Row: {
          active: boolean
          case_id: string
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          descricao: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          active?: boolean
          case_id: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          descricao?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          active?: boolean
          case_id?: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          descricao?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_case_evidences_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_case_witnesses: {
        Row: {
          active: boolean
          cargo: string | null
          case_id: string
          cpf: string | null
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          id: string
          nome: string
          observacoes: string | null
          relato: string | null
          telefone: string | null
        }
        Insert: {
          active?: boolean
          cargo?: string | null
          case_id: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          relato?: string | null
          telefone?: string | null
        }
        Update: {
          active?: boolean
          cargo?: string | null
          case_id?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          relato?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_case_witnesses_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_cases: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          description: string
          employee_id: string
          final_decision: string | null
          id: string
          legal_basis: string[]
          observations: string | null
          occurrence_date: string | null
          opened_at: string
          opened_by: string | null
          status: string
          updated_at: string
          warning_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          description: string
          employee_id: string
          final_decision?: string | null
          id?: string
          legal_basis?: string[]
          observations?: string | null
          occurrence_date?: string | null
          opened_at?: string
          opened_by?: string | null
          status?: string
          updated_at?: string
          warning_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          description?: string
          employee_id?: string
          final_decision?: string | null
          id?: string
          legal_basis?: string[]
          observations?: string | null
          occurrence_date?: string | null
          opened_at?: string
          opened_by?: string | null
          status?: string
          updated_at?: string
          warning_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_cases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_cases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
          },
          {
            foreignKeyName: "disciplinary_cases_warning_id_fkey"
            columns: ["warning_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_warnings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_cases_warning_id_fkey"
            columns: ["warning_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_print_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      disciplinary_warnings: {
        Row: {
          action_type: string
          active: boolean
          city: string
          clt_article: string
          clt_subsections: string[]
          colaborador_id: string
          conduct_description: string
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          employee_cpf: string | null
          employee_name: string
          employee_role: string | null
          employee_signature_url: string | null
          empresa_cnpj: string | null
          empresa_id: string
          empresa_razao_social: string | null
          generated_document_url: string | null
          id: string
          observacoes: string | null
          suspension_days: number | null
          suspension_end_date: string | null
          suspension_start_date: string | null
          updated_at: string
          warning_date: string
          warning_reason_id: string | null
          witness_signature_url: string | null
        }
        Insert: {
          action_type?: string
          active?: boolean
          city?: string
          clt_article?: string
          clt_subsections?: string[]
          colaborador_id: string
          conduct_description: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          employee_cpf?: string | null
          employee_name: string
          employee_role?: string | null
          employee_signature_url?: string | null
          empresa_cnpj?: string | null
          empresa_id: string
          empresa_razao_social?: string | null
          generated_document_url?: string | null
          id?: string
          observacoes?: string | null
          suspension_days?: number | null
          suspension_end_date?: string | null
          suspension_start_date?: string | null
          updated_at?: string
          warning_date?: string
          warning_reason_id?: string | null
          witness_signature_url?: string | null
        }
        Update: {
          action_type?: string
          active?: boolean
          city?: string
          clt_article?: string
          clt_subsections?: string[]
          colaborador_id?: string
          conduct_description?: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          employee_cpf?: string | null
          employee_name?: string
          employee_role?: string | null
          employee_signature_url?: string | null
          empresa_cnpj?: string | null
          empresa_id?: string
          empresa_razao_social?: string | null
          generated_document_url?: string | null
          id?: string
          observacoes?: string | null
          suspension_days?: number | null
          suspension_end_date?: string | null
          suspension_start_date?: string | null
          updated_at?: string
          warning_date?: string
          warning_reason_id?: string | null
          witness_signature_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_warnings_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_warnings_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
          },
          {
            foreignKeyName: "disciplinary_warnings_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_warnings_warning_reason_id_fkey"
            columns: ["warning_reason_id"]
            isOneToOne: false
            referencedRelation: "warning_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          nome: string
          razao_social: string | null
          situacao: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          razao_social?: string | null
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
          razao_social?: string | null
          situacao?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      equipment_return_checklist: {
        Row: {
          case_id: string
          completed: boolean
          created_at: string
          id: string
          items: Json
          observations: string | null
          responsible_user_id: string | null
          return_date: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          completed?: boolean
          created_at?: string
          id?: string
          items?: Json
          observations?: string | null
          responsible_user_id?: string | null
          return_date?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed?: boolean
          created_at?: string
          id?: string
          items?: Json
          observations?: string | null
          responsible_user_id?: string | null
          return_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_return_checklist_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "disciplinary_cases"
            referencedColumns: ["id"]
          },
        ]
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
          colaborador_coberto_id: string | null
          colaborador_id: string
          comprovante_url: string | null
          created_at: string
          created_by: string | null
          data: string
          data_pagamento: string | null
          emitente_id: string | null
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
          colaborador_coberto_id?: string | null
          colaborador_id: string
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          data_pagamento?: string | null
          emitente_id?: string | null
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
          colaborador_coberto_id?: string | null
          colaborador_id?: string
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          data_pagamento?: string | null
          emitente_id?: string | null
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
            foreignKeyName: "extras_colaborador_coberto_id_fkey"
            columns: ["colaborador_coberto_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_colaborador_coberto_id_fkey"
            columns: ["colaborador_coberto_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
          },
          {
            foreignKeyName: "extras_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
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
      importacoes_lotacao: {
        Row: {
          arquivo_nome: string | null
          atualizadas: number
          created_at: string
          criadas: number
          erros: number
          id: string
          ignoradas: number
          resumo: Json | null
          total_linhas: number
          usuario_id: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          atualizadas?: number
          created_at?: string
          criadas?: number
          erros?: number
          id?: string
          ignoradas?: number
          resumo?: Json | null
          total_linhas?: number
          usuario_id?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          atualizadas?: number
          created_at?: string
          criadas?: number
          erros?: number
          id?: string
          ignoradas?: number
          resumo?: Json | null
          total_linhas?: number
          usuario_id?: string | null
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
          arquivado_em: string | null
          arquivado_por: string | null
          assinatura_url: string | null
          ativo: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          colaborador_id: string
          created_at: string
          data_pagamento: string
          gerado_em: string
          gerado_por: string | null
          id: string
          motivo_cancelamento: string | null
          numero: number
          semana_ref: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          arquivado_em?: string | null
          arquivado_por?: string | null
          assinatura_url?: string | null
          ativo?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id: string
          created_at?: string
          data_pagamento: string
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: number
          semana_ref: string
          updated_at?: string
          valor_total: number
        }
        Update: {
          arquivado_em?: string | null
          arquivado_por?: string | null
          assinatura_url?: string | null
          ativo?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id?: string
          created_at?: string
          data_pagamento?: string
          gerado_em?: string
          gerado_por?: string | null
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
          {
            foreignKeyName: "recibos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
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
      warning_reasons: {
        Row: {
          ativo: boolean
          clt_article: string
          clt_subsections: string[]
          created_at: string
          descricao_padrao: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clt_article?: string
          clt_subsections?: string[]
          created_at?: string
          descricao_padrao: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clt_article?: string
          clt_subsections?: string[]
          created_at?: string
          descricao_padrao?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_disciplinary_dashboard: {
        Row: {
          action_type: string | null
          active: boolean | null
          colaborador_id: string | null
          colaborador_nome: string | null
          cpf: string | null
          created_by: string | null
          empresa_id: string | null
          empresa_nome: string | null
          id: string | null
          mes_ref: string | null
          reason_nome: string | null
          warning_date: string | null
          warning_reason_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_warnings_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_warnings_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_disciplinary_stats_by_employee"
            referencedColumns: ["colaborador_id"]
          },
          {
            foreignKeyName: "disciplinary_warnings_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_warnings_warning_reason_id_fkey"
            columns: ["warning_reason_id"]
            isOneToOne: false
            referencedRelation: "warning_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      v_disciplinary_stats_by_employee: {
        Row: {
          colaborador_id: string | null
          cpf: string | null
          empresa_id: string | null
          nome: string | null
          qtd_advertencias: number | null
          qtd_justas_causas: number | null
          qtd_orientacoes: number | null
          qtd_suspensoes: number | null
          ultima_advertencia: string | null
          ultima_ocorrencia: string | null
          ultima_suspensao: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      almox_registrar_movimentacao: {
        Args: {
          p_colaborador_id?: string
          p_entrega_id?: string
          p_item_id: string
          p_motivo: string
          p_observacao?: string
          p_quantidade: number
          p_tamanho: string
          p_tipo: string
        }
        Returns: string
      }
      get_recidivism_counts: {
        Args: { _employee_id: string; _reason_id?: string }
        Returns: Json
      }
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
      semana_ref_de:
        | { Args: { d: string }; Returns: string }
        | { Args: { ts: string }; Returns: string }
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
        | "extra_normal"
        | "cobertura_folga"
        | "treinamento"
        | "solicitacao_cliente"
        | "sem_efetivo"
        | "falta"
        | "atraso_rendicao"
        | "sdf"
        | "reciclagem"
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
        "extra_normal",
        "cobertura_folga",
        "treinamento",
        "solicitacao_cliente",
        "sem_efetivo",
        "falta",
        "atraso_rendicao",
        "sdf",
        "reciclagem",
      ],
    },
  },
} as const
