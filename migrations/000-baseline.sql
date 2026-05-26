-- BASELINE do schema `public` — snapshot introspecção (NÃO é pg_dump).
-- Gerado por scripts/dump-schema.mjs em 2026-05-26T10:36:02.838Z
-- Reconstrói tabelas core não-versionadas (migrations 001-021 removidas).
-- Idempotente onde possível (IF NOT EXISTS). Revisar antes de aplicar num banco novo.

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."_tmp_mercado_escola_raw" (
  "codigo_inep" text,
  "nome" text,
  "municipio" text,
  "municipio_ibge" text,
  "uf" text,
  "rede" text,
  "microrregiao" text,
  "inse_grupo" smallint,
  "etapas" text[],
  "qt_professores" integer,
  "qt_docs_jovens" integer,
  "qt_docs_pos" integer,
  "qt_coord_pedag" integer,
  "qt_diretor_proxy" integer,
  "score_conectividade" numeric(5,2),
  "score_pedagogica" numeric(5,2),
  "score_basica" numeric(5,2),
  "in_climatizacao" integer,
  "in_lab_ciencias" integer,
  "in_quadra_coberta" integer,
  "in_auditorio" integer,
  "qt_devices_aluno" integer,
  "qt_doc_0_24" integer DEFAULT 0
);
ALTER TABLE public."_tmp_mercado_escola_raw" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."academia" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "cargo" text,
  "competencia_id" text,
  "nome" text,
  "n1" text,
  "n2" text,
  "n3" text,
  "n4" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."academia" ADD CONSTRAINT "academia_pkey" PRIMARY KEY (id);
ALTER TABLE public."academia" ADD CONSTRAINT "academia_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."academia" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."admin_audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "admin_email" text NOT NULL,
  "admin_user_id" uuid,
  "acao" text NOT NULL,
  "empresa_id" uuid,
  "empresa_slug" text,
  "alvo" text,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resultado" text DEFAULT 'ok'::text NOT NULL,
  "ip" text,
  "user_agent" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."admin_audit_log" ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."admin_audit_log" ADD CONSTRAINT "admin_audit_log_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE public."admin_audit_log" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."banco_cenarios" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid,
  "cargo" text,
  "competencia_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "alternativas" jsonb DEFAULT '[]'::jsonb,
  "titulo" text,
  "descricao" text,
  "nota_check" integer,
  "status_check" text,
  "dimensoes_check" jsonb,
  "justificativa_check" text,
  "sugestao_check" text,
  "alertas_check" jsonb DEFAULT '[]'::jsonb,
  "checked_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now(),
  "tipo_cenario" text,
  "p1" text,
  "p2" text,
  "p3" text,
  "p4" text
);
ALTER TABLE public."banco_cenarios" ADD CONSTRAINT "banco_cenarios_pkey" PRIMARY KEY (id);
ALTER TABLE public."banco_cenarios" ADD CONSTRAINT "banco_cenarios_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."banco_cenarios" ADD CONSTRAINT "banco_cenarios_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."banco_cenarios" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."capacitacao" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid,
  "email" text NOT NULL,
  "semana" integer NOT NULL,
  "tipo" text NOT NULL,
  "competencia_id" text,
  "pilula_ok" boolean DEFAULT false,
  "evidencia" jsonb,
  "evidencia_texto" text,
  "pontos" integer DEFAULT 0,
  "data_registro" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "evidencia_avaliacao" jsonb
);
ALTER TABLE public."capacitacao" ADD CONSTRAINT "capacitacao_empresa_id_email_semana_tipo_key" UNIQUE (empresa_id, email, semana, tipo);
ALTER TABLE public."capacitacao" ADD CONSTRAINT "capacitacao_pkey" PRIMARY KEY (id);
ALTER TABLE public."capacitacao" ADD CONSTRAINT "capacitacao_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."capacitacao" ADD CONSTRAINT "capacitacao_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."capacitacao" ADD CONSTRAINT "capacitacao_semana_check" CHECK (((semana >= 1) AND (semana <= 14)));
ALTER TABLE public."capacitacao" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."cargos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "id_cargo" text,
  "nome" text NOT NULL,
  "area_depto" text,
  "descricao" text,
  "entregas_esperadas" text,
  "contexto_cultural" text,
  "competencias_top10" jsonb DEFAULT '[]'::jsonb,
  "justificativa_ia1" text,
  "top5_workshop" jsonb DEFAULT '[]'::jsonb,
  "tela1" text,
  "tela2" text,
  "tela3" text,
  "tela4" text,
  "status_ia" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."cargos" ADD CONSTRAINT "cargos_pkey" PRIMARY KEY (id);
ALTER TABLE public."cargos" ADD CONSTRAINT "cargos_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."cargos" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."cargos_empresa" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "area_depto" text,
  "descricao" text,
  "principais_entregas" text,
  "stakeholders" text,
  "decisoes_recorrentes" text,
  "tensoes_comuns" text,
  "contexto_cultural" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "top5_workshop" jsonb DEFAULT '[]'::jsonb,
  "gabarito" jsonb,
  "raciocinio_ia2" jsonb,
  "fit_perfil_ideal" jsonb,
  "fit_versao" text DEFAULT '2.0'::text,
  "competencia_foco" text,
  "eh_lideranca" boolean DEFAULT true,
  "ia1_resultado" jsonb,
  "confianca_media_ia2" numeric
);
ALTER TABLE public."cargos_empresa" ADD CONSTRAINT "cargos_empresa_empresa_id_nome_key" UNIQUE (empresa_id, nome);
ALTER TABLE public."cargos_empresa" ADD CONSTRAINT "cargos_empresa_pkey" PRIMARY KEY (id);
ALTER TABLE public."cargos_empresa" ADD CONSTRAINT "cargos_empresa_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."cargos_empresa" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."catalogo_enriquecido" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "course_id" integer NOT NULL,
  "cargo" text,
  "competencia" text,
  "competencia_secundaria" text,
  "descritor_1" text,
  "descritor_2" text,
  "descritor_3" text,
  "nivel_ideal" smallint,
  "tempo_estimado_min" integer,
  "confianca" text,
  "tipo" text DEFAULT 'conteudo'::text,
  "resumo_tutor" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "nivel_desc_1" smallint,
  "nivel_desc_2" smallint,
  "nivel_desc_3" smallint
);
ALTER TABLE public."catalogo_enriquecido" ADD CONSTRAINT "catalogo_enriquecido_pkey" PRIMARY KEY (id);
ALTER TABLE public."catalogo_enriquecido" ADD CONSTRAINT "catalogo_enriquecido_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."catalogo_enriquecido" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."checkpoints_gestor" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "trilha_id" uuid NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "gestor_id" uuid,
  "semana" integer NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "observacao" text,
  "avaliacao_gestor" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "validado_em" timestamp with time zone
);
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_trilha_id_semana_key" UNIQUE (trilha_id, semana);
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_pkey" PRIMARY KEY (id);
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_gestor_id_fkey" FOREIGN KEY (gestor_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_trilha_id_fkey" FOREIGN KEY (trilha_id) REFERENCES trilhas(id) ON DELETE CASCADE;
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_avaliacao_gestor_check" CHECK ((avaliacao_gestor = ANY (ARRAY['evoluindo'::text, 'estagnado'::text, 'regredindo'::text])));
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_semana_check" CHECK ((semana = ANY (ARRAY[5, 10])));
ALTER TABLE public."checkpoints_gestor" ADD CONSTRAINT "checkpoints_gestor_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'validado'::text, 'alerta'::text])));
ALTER TABLE public."checkpoints_gestor" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."cis_ia_referencia" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "teoria" text,
  "dimensao" text,
  "intensidade" text,
  "categoria" text,
  "conteudo_resumo" text,
  "conteudo_detalhado" text,
  "sinal_observavel" text,
  "hipotese_interpretativa" text,
  "risco_se_em_excesso" text,
  "usar_para_cenario" text,
  "usar_para_pdi" text,
  "uso_operacional" text,
  "aplicacao_escola" text,
  "confianca_inferencia" text,
  "nao_concluir_isoladamente" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."cis_ia_referencia" ADD CONSTRAINT "cis_ia_referencia_pkey" PRIMARY KEY (id);
ALTER TABLE public."cis_ia_referencia" ADD CONSTRAINT "cis_ia_referencia_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."cis_ia_referencia" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."cis_referencia" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "teoria" text,
  "dimensao" text,
  "intensidade" text,
  "categoria" text,
  "conteudo" text,
  "uso_no_sistema" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."cis_referencia" ADD CONSTRAINT "cis_referencia_pkey" PRIMARY KEY (id);
ALTER TABLE public."cis_referencia" ADD CONSTRAINT "cis_referencia_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."cis_referencia" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."cobertura_conteudo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "cargo" text,
  "competencia" text,
  "descritor" text,
  "n1_n2_status" text,
  "n1_n2_qtd" integer DEFAULT 0,
  "n1_n2_cursos" text,
  "n2_n3_status" text,
  "n2_n3_qtd" integer DEFAULT 0,
  "n2_n3_cursos" text,
  "cobertura_pct" numeric DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."cobertura_conteudo" ADD CONSTRAINT "cobertura_conteudo_pkey" PRIMARY KEY (id);
ALTER TABLE public."cobertura_conteudo" ADD CONSTRAINT "cobertura_conteudo_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."cobertura_conteudo" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."colab_otp" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "telefone" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."colab_otp" ADD CONSTRAINT "colab_otp_pkey" PRIMARY KEY (id);
ALTER TABLE public."colab_otp" ADD CONSTRAINT "colab_otp_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."colab_otp" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."colaboradores" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "email" text NOT NULL,
  "nome_completo" text,
  "cargo" text,
  "area_depto" text,
  "perfil_dominante" text,
  "d_natural" numeric,
  "i_natural" numeric,
  "s_natural" numeric,
  "c_natural" numeric,
  "val_teorico" numeric,
  "val_economico" numeric,
  "val_estetico" numeric,
  "val_social" numeric,
  "val_politico" numeric,
  "val_religioso" numeric,
  "tp_sensor_intuitivo" text,
  "tp_racional_emocional" text,
  "tp_introvertido_extrovertido" text,
  "whatsapp" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "role" text DEFAULT 'colaborador'::text NOT NULL,
  "d_adaptado" numeric,
  "i_adaptado" numeric,
  "s_adaptado" numeric,
  "c_adaptado" numeric,
  "disc_resultados" jsonb,
  "lid_executivo" numeric,
  "lid_motivador" numeric,
  "lid_metodico" numeric,
  "lid_sistematico" numeric,
  "comp_ousadia" numeric,
  "comp_comando" numeric,
  "comp_objetividade" numeric,
  "comp_assertividade" numeric,
  "comp_persuasao" numeric,
  "comp_extroversao" numeric,
  "comp_entusiasmo" numeric,
  "comp_sociabilidade" numeric,
  "comp_empatia" numeric,
  "comp_paciencia" numeric,
  "comp_persistencia" numeric,
  "comp_planejamento" numeric,
  "comp_organizacao" numeric,
  "comp_detalhismo" numeric,
  "comp_prudencia" numeric,
  "comp_concentracao" numeric,
  "pref_video_curto" integer,
  "pref_video_longo" integer,
  "pref_texto" integer,
  "pref_audio" integer,
  "pref_infografico" integer,
  "pref_exercicio" integer,
  "pref_mentor" integer,
  "pref_estudo_caso" integer,
  "mapeamento_em" timestamp with time zone,
  "telefone" text,
  "gestor_nome" text,
  "gestor_email" text,
  "gestor_whatsapp" text,
  "report_texts" jsonb,
  "report_generated_at" timestamp with time zone,
  "comp_ousadia_adapt" numeric,
  "comp_comando_adapt" numeric,
  "comp_objetividade_adapt" numeric,
  "comp_assertividade_adapt" numeric,
  "comp_persuasao_adapt" numeric,
  "comp_extroversao_adapt" numeric,
  "comp_entusiasmo_adapt" numeric,
  "comp_sociabilidade_adapt" numeric,
  "comp_empatia_adapt" numeric,
  "comp_paciencia_adapt" numeric,
  "comp_persistencia_adapt" numeric,
  "comp_planejamento_adapt" numeric,
  "comp_organizacao_adapt" numeric,
  "comp_detalhismo_adapt" numeric,
  "comp_prudencia_adapt" numeric,
  "comp_concentracao_adapt" numeric,
  "positividade" numeric,
  "estima" numeric,
  "flexibilidade" numeric,
  "tipo_psicologico" text,
  "extroversao" numeric,
  "intuicao" numeric,
  "pensamento" numeric,
  "comportamental_pdf_path" text,
  "insights_executivos" jsonb,
  "insights_executivos_at" timestamp with time zone,
  "foto_url" text,
  "avatar_preset" text,
  "perfil_externo_fonte" text,
  "perfil_externo_dados" jsonb,
  "perfil_externo_pdf_path" text,
  "perfil_externo_extraido_em" timestamp with time zone,
  "tutorados_ids" uuid[] DEFAULT '{}'::uuid[],
  "login_por_whatsapp" boolean DEFAULT false NOT NULL,
  "locale" text
);
ALTER TABLE public."colaboradores" ADD CONSTRAINT "colaboradores_empresa_id_email_key" UNIQUE (empresa_id, email);
ALTER TABLE public."colaboradores" ADD CONSTRAINT "colaboradores_pkey" PRIMARY KEY (id);
ALTER TABLE public."colaboradores" ADD CONSTRAINT "colaboradores_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."colaboradores" ADD CONSTRAINT "colaboradores_locale_check" CHECK (((locale IS NULL) OR (locale = ANY (ARRAY['pt-BR'::text, 'pt-PT'::text, 'es-ES'::text, 'en-US'::text]))));
ALTER TABLE public."colaboradores" ADD CONSTRAINT "colaboradores_perfil_externo_fonte_check" CHECK (((perfil_externo_fonte IS NULL) OR (perfil_externo_fonte = ANY (ARRAY['opq32'::text, 'hogan'::text, 'mbti'::text, 'big5'::text]))));
ALTER TABLE public."colaboradores" ADD CONSTRAINT "colaboradores_role_check" CHECK ((role = ANY (ARRAY['colaborador'::text, 'gestor'::text, 'rh'::text])));
ALTER TABLE public."colaboradores" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."competencias" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "cargo" text,
  "pilar" text,
  "cod_comp" text NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "cod_desc" text,
  "nome_curto" text,
  "descritor_completo" text,
  "n1_gap" text,
  "n2_desenvolvimento" text,
  "n3_meta" text,
  "n4_referencia" text,
  "evidencias_esperadas" text,
  "perguntas_alvo" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."competencias" ADD CONSTRAINT "competencias_pkey" PRIMARY KEY (id);
ALTER TABLE public."competencias" ADD CONSTRAINT "competencias_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."competencias" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."competencias_base" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "segmento" text NOT NULL,
  "cod_comp" text NOT NULL,
  "nome" text NOT NULL,
  "pilar" text,
  "descricao" text,
  "cod_desc" text,
  "nome_curto" text,
  "descritor_completo" text,
  "n1_gap" text,
  "n2_desenvolvimento" text,
  "n3_meta" text,
  "n4_referencia" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cargo" text,
  "evidencias_esperadas" text,
  "perguntas_alvo" text
);
ALTER TABLE public."competencias_base" ADD CONSTRAINT "competencias_base_pkey" PRIMARY KEY (id);
ALTER TABLE public."competencias_base" ADD CONSTRAINT "competencias_base_segmento_check" CHECK ((segmento = ANY (ARRAY['educacao'::text, 'corporativo'::text])));
ALTER TABLE public."competencias_base" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."descriptor_assessments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid,
  "colaborador_id" uuid,
  "cargo" text,
  "competencia" text NOT NULL,
  "descritor" text NOT NULL,
  "nota" numeric NOT NULL,
  "nivel" text DEFAULT 
CASE
    WHEN (nota < 1.5) THEN 'inicial'::text
    WHEN (nota < 2.5) THEN 'em_desenvolvimento'::text
    WHEN (nota < 3.5) THEN 'proficiente'::text
    ELSE 'avancado'::text
END,
  "origem" text DEFAULT 'manual'::text,
  "assessment_date" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."descriptor_assessments" ADD CONSTRAINT "descriptor_assessments_colaborador_id_competencia_descritor_key" UNIQUE (colaborador_id, competencia, descritor);
ALTER TABLE public."descriptor_assessments" ADD CONSTRAINT "descriptor_assessments_pkey" PRIMARY KEY (id);
ALTER TABLE public."descriptor_assessments" ADD CONSTRAINT "descriptor_assessments_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."descriptor_assessments" ADD CONSTRAINT "descriptor_assessments_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."descriptor_assessments" ADD CONSTRAINT "descriptor_assessments_nota_check" CHECK (((nota >= 1.0) AND (nota <= 4.0)));
ALTER TABLE public."descriptor_assessments" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_analises_ia" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" text NOT NULL,
  "scope_id" text NOT NULL,
  "prompt_version" text NOT NULL,
  "dados_hash" text NOT NULL,
  "conteudo" jsonb NOT NULL,
  "modelo" text NOT NULL,
  "tokens_in" integer,
  "tokens_out" integer,
  "custo_usd" numeric(10,6),
  "pdf_url" text,
  "pdf_path" text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_analises_ia" ADD CONSTRAINT "diag_analises_ia_scope_type_scope_id_prompt_version_dados_h_key" UNIQUE (scope_type, scope_id, prompt_version, dados_hash);
ALTER TABLE public."diag_analises_ia" ADD CONSTRAINT "diag_analises_ia_pkey" PRIMARY KEY (id);
ALTER TABLE public."diag_analises_ia" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_censo_docentes" (
  "codigo_inep" text NOT NULL,
  "ano" smallint NOT NULL,
  "qt_doc_bas" integer,
  "qt_doc_inf" integer,
  "qt_doc_inf_cre" integer,
  "qt_doc_inf_pre" integer,
  "qt_doc_fund" integer,
  "qt_doc_fund_ai" integer,
  "qt_doc_fund_af" integer,
  "qt_doc_med" integer,
  "qt_doc_bas_docente" integer,
  "qt_doc_bas_auxiliar" integer,
  "qt_doc_bas_profi_monitor" integer,
  "qt_doc_bas_esco_sup_grad" integer,
  "qt_doc_bas_esco_sup_grad_licen" integer,
  "qt_doc_bas_esco_sup_grad_slicen" integer,
  "qt_doc_bas_esco_sup_pos_espec" integer,
  "qt_doc_bas_esco_sup_pos_mestra" integer,
  "qt_doc_bas_esco_sup_pos_douto" integer,
  "qt_doc_bas_vinculo_concur" integer,
  "qt_doc_bas_vinculo_contra" integer,
  "qt_doc_bas_vinculo_terceir" integer,
  "qt_doc_bas_vinculo_clt" integer,
  "qt_doc_bas_fem" integer,
  "qt_doc_bas_masc" integer,
  "qt_doc_bas_pcd" integer,
  "qt_doc_bas_0_24" integer,
  "qt_doc_bas_25_29" integer,
  "qt_doc_bas_30_39" integer,
  "qt_doc_bas_40_49" integer,
  "qt_doc_bas_50_54" integer,
  "qt_doc_bas_55_59" integer,
  "qt_doc_bas_60_mais" integer,
  "disciplinas" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "especializacoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "quantidades" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."diag_censo_docentes" ADD CONSTRAINT "diag_censo_docentes_pkey" PRIMARY KEY (codigo_inep, ano);
ALTER TABLE public."diag_censo_docentes" ADD CONSTRAINT "diag_censo_docentes_codigo_inep_fkey" FOREIGN KEY (codigo_inep) REFERENCES diag_escolas(codigo_inep) ON DELETE CASCADE;
ALTER TABLE public."diag_censo_docentes" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_censo_infra" (
  "codigo_inep" text NOT NULL,
  "ano" smallint NOT NULL,
  "situacao_funcionamento" text,
  "zona_localizacao" text,
  "zona_diferenciada" text,
  "latitude" double precision,
  "longitude" double precision,
  "endereco" text,
  "bairro" text,
  "cep" text,
  "indicadores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "quantidades" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "score_basica" numeric(5,2),
  "score_pedagogica" numeric(5,2),
  "score_acessibilidade" numeric(5,2),
  "score_conectividade" numeric(5,2),
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "matriculas" integer
);
ALTER TABLE public."diag_censo_infra" ADD CONSTRAINT "diag_censo_infra_pkey" PRIMARY KEY (codigo_inep, ano);
ALTER TABLE public."diag_censo_infra" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_enem_escola_snapshots" (
  "codigo_inep" text NOT NULL,
  "ano" smallint NOT NULL,
  "municipio_ibge" text,
  "municipio" text,
  "uf" text,
  "dependencia_adm_code" smallint,
  "dependencia_adm" text,
  "localizacao_code" smallint,
  "localizacao" text,
  "situacao_funcionamento_code" smallint,
  "participantes_total" integer DEFAULT 0 NOT NULL,
  "participantes_com_objetiva" integer DEFAULT 0 NOT NULL,
  "participantes_com_redacao" integer DEFAULT 0 NOT NULL,
  "participantes_com_media_geral" integer DEFAULT 0 NOT NULL,
  "media_cn" numeric,
  "media_ch" numeric,
  "media_lc" numeric,
  "media_mt" numeric,
  "media_redacao" numeric,
  "media_objetiva" numeric,
  "media_geral" numeric,
  "presenca_dist" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status_redacao_dist" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."diag_enem_escola_snapshots" ADD CONSTRAINT "diag_enem_escola_snapshots_pkey" PRIMARY KEY (codigo_inep, ano);
ALTER TABLE public."diag_enem_escola_snapshots" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_escolas" (
  "codigo_inep" text NOT NULL,
  "nome" text NOT NULL,
  "rede" text,
  "municipio" text,
  "municipio_ibge" text,
  "uf" text,
  "microrregiao" text,
  "zona" text,
  "inse_grupo" smallint,
  "etapas" text[] DEFAULT ARRAY[]::text[],
  "status" text DEFAULT 'ativa'::text NOT NULL,
  "ano_referencia" smallint,
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_escolas" ADD CONSTRAINT "diag_escolas_pkey" PRIMARY KEY (codigo_inep);
ALTER TABLE public."diag_escolas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_eventos" (
  "id" bigint DEFAULT nextval('diag_eventos_id_seq'::regclass) NOT NULL,
  "tipo" text NOT NULL,
  "scope_type" text,
  "scope_id" text,
  "ip_hash" text,
  "user_agent" text,
  "referer" text,
  "is_bot" boolean DEFAULT false,
  "extra" jsonb,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_eventos" ADD CONSTRAINT "diag_eventos_pkey" PRIMARY KEY (id);
ALTER TABLE public."diag_eventos" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_fundeb_receita_prevista" (
  "municipio_ibge" text NOT NULL,
  "uf" text,
  "entidade" text,
  "ano" smallint NOT NULL,
  "receita_contribuicao" numeric,
  "complementacao_vaaf" numeric,
  "complementacao_vaat" numeric,
  "complementacao_vaar" numeric,
  "complementacao_uniao_total" numeric,
  "total_receita_prevista" numeric,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_fundeb_receita_prevista" ADD CONSTRAINT "diag_fundeb_receita_prevista_pkey" PRIMARY KEY (municipio_ibge, ano);
ALTER TABLE public."diag_fundeb_receita_prevista" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_fundeb_repasses" (
  "municipio_ibge" text NOT NULL,
  "uf" text,
  "ano" smallint NOT NULL,
  "total_repasse_bruto" numeric,
  "total_complementacao_uniao" numeric,
  "matriculas_consideradas" integer,
  "valor_aluno_ano" numeric DEFAULT 
CASE
    WHEN (matriculas_consideradas > 0) THEN (COALESCE(total_repasse_bruto, (0)::numeric) / (matriculas_consideradas)::numeric)
    ELSE NULL::numeric
END,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_fundeb_repasses" ADD CONSTRAINT "diag_fundeb_repasses_pkey" PRIMARY KEY (municipio_ibge, ano);
ALTER TABLE public."diag_fundeb_repasses" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_fundeb_vaar" (
  "municipio_ibge" text NOT NULL,
  "uf" text,
  "entidade" text,
  "ano" smallint NOT NULL,
  "cond_i" boolean,
  "cond_ii" boolean,
  "cond_iii" boolean,
  "cond_iv" boolean,
  "cond_v" boolean,
  "habilitado" boolean,
  "evoluiu_atendimento" boolean,
  "evoluiu_aprendizagem" boolean,
  "beneficiario" boolean,
  "pendencia" text,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_fundeb_vaar" ADD CONSTRAINT "diag_fundeb_vaar_pkey" PRIMARY KEY (municipio_ibge, ano);
ALTER TABLE public."diag_fundeb_vaar" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_ica_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "municipio_ibge" text NOT NULL,
  "uf" text NOT NULL,
  "rede" text NOT NULL,
  "ano" smallint NOT NULL,
  "alunos_avaliados" integer,
  "alfabetizados" integer,
  "taxa" numeric(5,2),
  "total_estado" numeric(5,2),
  "total_brasil" numeric(5,2),
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_ica_snapshots" ADD CONSTRAINT "diag_ica_snapshots_municipio_ibge_rede_ano_key" UNIQUE (municipio_ibge, rede, ano);
ALTER TABLE public."diag_ica_snapshots" ADD CONSTRAINT "diag_ica_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."diag_ica_snapshots" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_ideb_metas" (
  "codigo_inep" text NOT NULL,
  "ano" smallint NOT NULL,
  "etapa" text NOT NULL,
  "meta_projetada" numeric,
  "ideb_realizado" numeric,
  "status" text DEFAULT 
CASE
    WHEN ((meta_projetada IS NULL) OR (ideb_realizado IS NULL)) THEN 'sem_dado'::text
    WHEN (ideb_realizado >= (meta_projetada + 0.3)) THEN 'superou'::text
    WHEN (ideb_realizado >= meta_projetada) THEN 'atingiu'::text
    ELSE 'abaixo'::text
END,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_ideb_metas" ADD CONSTRAINT "diag_ideb_metas_pkey" PRIMARY KEY (codigo_inep, ano, etapa);
ALTER TABLE public."diag_ideb_metas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_ideb_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "escopo" text NOT NULL,
  "codigo_inep" text,
  "municipio_ibge" text,
  "uf" text,
  "rede" text,
  "etapa" text NOT NULL,
  "ano" smallint NOT NULL,
  "ideb" numeric(4,2),
  "meta" numeric(4,2),
  "indicador_rendimento" numeric(6,4),
  "nota_saeb" numeric(6,3),
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_ideb_snapshots" ADD CONSTRAINT "diag_ideb_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."diag_ideb_snapshots" ADD CONSTRAINT "diag_ideb_snapshots_escopo_check" CHECK ((escopo = ANY (ARRAY['escola'::text, 'municipio'::text, 'uf'::text, 'brasil'::text])));
ALTER TABLE public."diag_ideb_snapshots" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_ingest_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "fonte" text NOT NULL,
  "escopo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'rodando'::text NOT NULL,
  "total_planejado" integer,
  "total_processado" integer DEFAULT 0,
  "total_sucesso" integer DEFAULT 0,
  "total_falha" integer DEFAULT 0,
  "total_skipped" integer DEFAULT 0,
  "erros" jsonb DEFAULT '[]'::jsonb,
  "amostra_log" text,
  "arquivo_origem" text,
  "iniciado_em" timestamp with time zone DEFAULT now(),
  "finalizado_em" timestamp with time zone,
  "duracao_ms" integer
);
ALTER TABLE public."diag_ingest_runs" ADD CONSTRAINT "diag_ingest_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."diag_ingest_runs" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_leads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "nome" text,
  "cargo" text,
  "organizacao" text,
  "scope_type" text NOT NULL,
  "scope_id" text NOT NULL,
  "scope_label" text,
  "consentimento_lgpd" boolean DEFAULT false NOT NULL,
  "consentimento_em" timestamp with time zone,
  "pdf_status" text DEFAULT 'pendente'::text NOT NULL,
  "pdf_url" text,
  "pdf_path" text,
  "pdf_erro" text,
  "pdf_gerado_em" timestamp with time zone,
  "contato_em" timestamp with time zone,
  "convertido" boolean DEFAULT false,
  "notas_internas" text,
  "user_agent" text,
  "referer" text,
  "utm" jsonb,
  "ip_hash" text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_leads" ADD CONSTRAINT "diag_leads_pkey" PRIMARY KEY (id);
ALTER TABLE public."diag_leads" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_pdde_municipal" (
  "municipio_ibge" text NOT NULL,
  "uf" text,
  "ano" smallint NOT NULL,
  "total_repasse" numeric,
  "total_escolas_atendidas" integer,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_pdde_municipal" ADD CONSTRAINT "diag_pdde_municipal_pkey" PRIMARY KEY (municipio_ibge, ano);
ALTER TABLE public."diag_pdde_municipal" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_pdde_repasses" (
  "codigo_inep" text NOT NULL,
  "ano" smallint NOT NULL,
  "valor_recebido" numeric,
  "saldo_atual" numeric,
  "prestacao_contas_status" text,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."diag_pdde_repasses" ADD CONSTRAINT "diag_pdde_repasses_pkey" PRIMARY KEY (codigo_inep, ano);
ALTER TABLE public."diag_pdde_repasses" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_saeb_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "codigo_inep" text NOT NULL,
  "ano" smallint NOT NULL,
  "etapa" text NOT NULL,
  "disciplina" text NOT NULL,
  "distribuicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "similares" jsonb,
  "total_municipio" jsonb,
  "total_estado" jsonb,
  "total_brasil" jsonb,
  "presentes" integer,
  "matriculados" integer,
  "taxa_participacao" numeric(5,2),
  "formacao_docente" numeric(5,2),
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "media_proficiencia" numeric(8,2),
  "media_similares" numeric(8,2),
  "historico_proficiencia" jsonb DEFAULT '[]'::jsonb,
  "raw_api" jsonb
);
ALTER TABLE public."diag_saeb_snapshots" ADD CONSTRAINT "diag_saeb_snapshots_codigo_inep_ano_etapa_disciplina_key" UNIQUE (codigo_inep, ano, etapa, disciplina);
ALTER TABLE public."diag_saeb_snapshots" ADD CONSTRAINT "diag_saeb_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."diag_saeb_snapshots" ADD CONSTRAINT "diag_saeb_snapshots_codigo_inep_fkey" FOREIGN KEY (codigo_inep) REFERENCES diag_escolas(codigo_inep) ON DELETE CASCADE;
ALTER TABLE public."diag_saeb_snapshots" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."diag_saresp_snapshots" (
  "codigo_inep" text,
  "ano" smallint NOT NULL,
  "serie" smallint NOT NULL,
  "disciplina" text NOT NULL,
  "proficiencia_media" numeric,
  "distribuicao_niveis" jsonb DEFAULT '{}'::jsonb,
  "total_alunos" integer,
  "ingest_run_id" uuid,
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "codigo_sp" text NOT NULL,
  "rede" text,
  "turno" text,
  "escola_nome" text,
  "dep_administrativa" text
);
ALTER TABLE public."diag_saresp_snapshots" ADD CONSTRAINT "diag_saresp_snapshots_pkey" PRIMARY KEY (codigo_sp, ano, serie, disciplina);
ALTER TABLE public."diag_saresp_snapshots" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."empresas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "segmento" text,
  "ui_config" jsonb DEFAULT '{"labels": {}, "hidden_elements": []}'::jsonb,
  "slug" text NOT NULL,
  "sys_config" jsonb DEFAULT '{"ai": {"modelo_padrao": "claude-sonnet-4-6"}, "envios": {}, "cadencia": {}}'::jsonb,
  "default_locale" text DEFAULT 'pt-BR'::text NOT NULL
);
ALTER TABLE public."empresas" ADD CONSTRAINT "empresas_slug_unique" UNIQUE (slug);
ALTER TABLE public."empresas" ADD CONSTRAINT "empresas_pkey" PRIMARY KEY (id);
ALTER TABLE public."empresas" ADD CONSTRAINT "empresas_default_locale_check" CHECK ((default_locale = ANY (ARRAY['pt-BR'::text, 'pt-PT'::text, 'es-ES'::text, 'en-US'::text])));
ALTER TABLE public."empresas" ADD CONSTRAINT "empresas_segmento_check" CHECK ((segmento = ANY (ARRAY['educacao'::text, 'corporativo'::text])));
ALTER TABLE public."empresas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."envios_diagnostico" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "email" text NOT NULL,
  "nome" text,
  "cargo" text,
  "competencias_pendentes" text,
  "data_envio" timestamp with time zone,
  "canal" text,
  "status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."envios_diagnostico" ADD CONSTRAINT "envios_diagnostico_pkey" PRIMARY KEY (id);
ALTER TABLE public."envios_diagnostico" ADD CONSTRAINT "envios_diagnostico_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."envios_diagnostico" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."evolucao" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid,
  "email" text NOT NULL,
  "nome" text,
  "cargo" text,
  "area_escola" text,
  "competencia_id" text NOT NULL,
  "competencia_nome" text,
  "nota_a" numeric,
  "nivel_a" integer,
  "nota_b" numeric,
  "nivel_b" integer,
  "delta_nota" numeric DEFAULT (nota_b - nota_a),
  "delta_nivel" integer DEFAULT (nivel_b - nivel_a),
  "descritores_subiram" text,
  "convergencia_resumo" text,
  "consciencia_gap" text,
  "gaps_persistentes" text,
  "foco_ciclo2" text,
  "feedback" text,
  "payload_fusao" jsonb,
  "data_geracao" date,
  "status" text DEFAULT 'Gerado'::text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."evolucao" ADD CONSTRAINT "evolucao_empresa_id_email_competencia_id_key" UNIQUE (empresa_id, email, competencia_id);
ALTER TABLE public."evolucao" ADD CONSTRAINT "evolucao_pkey" PRIMARY KEY (id);
ALTER TABLE public."evolucao" ADD CONSTRAINT "evolucao_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."evolucao" ADD CONSTRAINT "evolucao_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."evolucao" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."evolucao_descritores" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid,
  "email" text NOT NULL,
  "competencia_id" text NOT NULL,
  "descritor_cod" text,
  "descritor_nome" text,
  "nivel_a" integer,
  "nivel_b" integer,
  "delta" numeric DEFAULT (nivel_b - nivel_a),
  "evidencia_cenario_b" text,
  "evidencia_conversa" text,
  "citacao" text,
  "convergencia" text,
  "conexao_cis" text,
  "confianca" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."evolucao_descritores" ADD CONSTRAINT "evolucao_descritores_empresa_id_email_competencia_id_descri_key" UNIQUE (empresa_id, email, competencia_id, descritor_cod);
ALTER TABLE public."evolucao_descritores" ADD CONSTRAINT "evolucao_descritores_pkey" PRIMARY KEY (id);
ALTER TABLE public."evolucao_descritores" ADD CONSTRAINT "evolucao_descritores_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."evolucao_descritores" ADD CONSTRAINT "evolucao_descritores_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."evolucao_descritores" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."fase4_envios" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid,
  "email" text NOT NULL,
  "nome" text,
  "cargo" text,
  "data_inicio" date,
  "semana_atual" integer DEFAULT 0,
  "ultimo_envio_pilula" timestamp with time zone,
  "ultimo_envio_evidencia" timestamp with time zone,
  "status" text DEFAULT 'Ativo'::text,
  "sequencia" jsonb DEFAULT '[]'::jsonb,
  "contrato" jsonb,
  "gestor_email" text,
  "whatsapp" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ultima_evidencia_em" timestamp with time zone
);
ALTER TABLE public."fase4_envios" ADD CONSTRAINT "fase4_envios_empresa_id_email_key" UNIQUE (empresa_id, email);
ALTER TABLE public."fase4_envios" ADD CONSTRAINT "fase4_envios_pkey" PRIMARY KEY (id);
ALTER TABLE public."fase4_envios" ADD CONSTRAINT "fase4_envios_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."fase4_envios" ADD CONSTRAINT "fase4_envios_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."fase4_envios" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."fit_resultados" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "cargo_id" uuid,
  "cargo_nome" text NOT NULL,
  "versao_modelo" text DEFAULT '2.0'::text,
  "fit_final" numeric NOT NULL,
  "classificacao" text,
  "recomendacao" text,
  "score_base" numeric,
  "fator_critico" numeric,
  "fator_excesso" numeric,
  "score_mapeamento" numeric,
  "score_competencias" numeric,
  "score_lideranca" numeric,
  "score_disc" numeric,
  "resultado_json" jsonb,
  "leitura_executiva" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "leitura_executiva_ai" text,
  "leitura_executiva_ai_at" timestamp with time zone
);
ALTER TABLE public."fit_resultados" ADD CONSTRAINT "fit_resultados_empresa_colab_uniq" UNIQUE (empresa_id, colaborador_id);
ALTER TABLE public."fit_resultados" ADD CONSTRAINT "fit_resultados_pkey" PRIMARY KEY (id);
ALTER TABLE public."fit_resultados" ADD CONSTRAINT "fit_resultados_cargo_id_fkey" FOREIGN KEY (cargo_id) REFERENCES cargos_empresa(id) ON DELETE SET NULL;
ALTER TABLE public."fit_resultados" ADD CONSTRAINT "fit_resultados_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."fit_resultados" ADD CONSTRAINT "fit_resultados_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."fit_resultados" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."ia_usage_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid,
  "colaborador_id" uuid,
  "feature" text NOT NULL,
  "trilha_id" uuid,
  "semana" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "model" text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."ia_usage_log" ADD CONSTRAINT "ia_usage_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."ia_usage_log" ADD CONSTRAINT "ia_usage_log_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."ia_usage_log" ADD CONSTRAINT "ia_usage_log_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."ia_usage_log" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."knowledge_base" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "titulo" text NOT NULL,
  "conteudo" text NOT NULL,
  "categoria" text,
  "source_url" text,
  "tsv" tsvector DEFAULT (setweight(to_tsvector('portuguese'::regconfig, COALESCE(titulo, ''::text)), 'A'::"char") || setweight(to_tsvector('portuguese'::regconfig, COALESCE(conteudo, ''::text)), 'B'::"char")),
  "ativo" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "criado_por" uuid,
  "embedding" vector(1024),
  "embedding_model" text,
  "embedding_at" timestamp with time zone
);
ALTER TABLE public."knowledge_base" ADD CONSTRAINT "knowledge_base_pkey" PRIMARY KEY (id);
ALTER TABLE public."knowledge_base" ADD CONSTRAINT "knowledge_base_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."knowledge_base" ADD CONSTRAINT "knowledge_base_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."knowledge_base" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."mensagens_chat" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sessao_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."mensagens_chat" ADD CONSTRAINT "mensagens_chat_pkey" PRIMARY KEY (id);
ALTER TABLE public."mensagens_chat" ADD CONSTRAINT "mensagens_chat_sessao_id_fkey" FOREIGN KEY (sessao_id) REFERENCES sessoes_avaliacao(id) ON DELETE CASCADE;
ALTER TABLE public."mensagens_chat" ADD CONSTRAINT "mensagens_chat_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])));
ALTER TABLE public."mensagens_chat" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."micro_conteudos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid,
  "titulo" text NOT NULL,
  "descricao" text,
  "formato" text NOT NULL,
  "duracao_min" numeric,
  "url" text,
  "storage_path" text,
  "bunny_video_id" text,
  "conteudo_inline" text,
  "competencia" text NOT NULL,
  "descritor" text,
  "nivel_min" numeric DEFAULT 1.0,
  "nivel_max" numeric DEFAULT 4.0,
  "tipo_conteudo" text DEFAULT 'core'::text,
  "contexto" text DEFAULT 'generico'::text,
  "cargo" text DEFAULT 'todos'::text,
  "setor" text DEFAULT 'todos'::text,
  "apresentador" text,
  "origem" text DEFAULT 'pre_produzido'::text,
  "versao" integer DEFAULT 1,
  "ativo" boolean DEFAULT true,
  "taxa_conclusao" numeric,
  "total_views" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "impacto_medio_delta" numeric(3,2),
  "impacto_amostras" integer DEFAULT 0,
  "impacto_atualizado_em" timestamp with time zone
);
ALTER TABLE public."micro_conteudos" ADD CONSTRAINT "micro_conteudos_pkey" PRIMARY KEY (id);
ALTER TABLE public."micro_conteudos" ADD CONSTRAINT "micro_conteudos_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."micro_conteudos" ADD CONSTRAINT "micro_conteudos_formato_check" CHECK ((formato = ANY (ARRAY['video'::text, 'audio'::text, 'texto'::text, 'case'::text, 'pdf'::text])));
ALTER TABLE public."micro_conteudos" ADD CONSTRAINT "micro_conteudos_origem_check" CHECK ((origem = ANY (ARRAY['pre_produzido'::text, 'ia_gerado'::text, 'ia_heygen_clone'::text, 'ia_podcast'::text])));
ALTER TABLE public."micro_conteudos" ADD CONSTRAINT "micro_conteudos_tipo_conteudo_check" CHECK ((tipo_conteudo = ANY (ARRAY['core'::text, 'complementar'::text])));
ALTER TABLE public."micro_conteudos" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."moodle_catalogo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "course_id" integer NOT NULL,
  "curso_nome" text,
  "curso_url" text,
  "qtd_secoes" integer DEFAULT 0,
  "qtd_modulos" integer DEFAULT 0,
  "secoes" text,
  "modulos" text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."moodle_catalogo" ADD CONSTRAINT "moodle_catalogo_empresa_id_course_id_key" UNIQUE (empresa_id, course_id);
ALTER TABLE public."moodle_catalogo" ADD CONSTRAINT "moodle_catalogo_pkey" PRIMARY KEY (id);
ALTER TABLE public."moodle_catalogo" ADD CONSTRAINT "moodle_catalogo_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."moodle_catalogo" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."pdis" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "conteudo" jsonb,
  "status" text DEFAULT 'ativo'::text NOT NULL,
  "gerado_em" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."pdis" ADD CONSTRAINT "pdis_pkey" PRIMARY KEY (id);
ALTER TABLE public."pdis" ADD CONSTRAINT "pdis_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."pdis" ADD CONSTRAINT "pdis_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."pdis" ADD CONSTRAINT "pdis_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'concluido'::text, 'cancelado'::text])));
ALTER TABLE public."pdis" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."permission_overrides" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" text NOT NULL,
  "scope_key" text NOT NULL,
  "permission_key" text NOT NULL,
  "effect" text NOT NULL,
  "reason" text NOT NULL,
  "created_by_email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."permission_overrides" ADD CONSTRAINT "permission_overrides_unique_scope_permission" UNIQUE (scope_type, scope_key, permission_key);
ALTER TABLE public."permission_overrides" ADD CONSTRAINT "permission_overrides_pkey" PRIMARY KEY (id);
ALTER TABLE public."permission_overrides" ADD CONSTRAINT "permission_overrides_effect_check" CHECK ((effect = ANY (ARRAY['allow'::text, 'deny'::text])));
ALTER TABLE public."permission_overrides" ADD CONSTRAINT "permission_overrides_reason_check" CHECK ((length(TRIM(BOTH FROM reason)) >= 5));
ALTER TABLE public."permission_overrides" ADD CONSTRAINT "permission_overrides_scope_type_check" CHECK ((scope_type = ANY (ARRAY['role'::text, 'user'::text])));
ALTER TABLE public."permission_overrides" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."platform_admins" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "nome" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."platform_admins" ADD CONSTRAINT "platform_admins_email_key" UNIQUE (email);
ALTER TABLE public."platform_admins" ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY (id);
ALTER TABLE public."platform_admins" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."ppp_escolas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "escola" text NOT NULL,
  "fonte" text DEFAULT 'pdf'::text,
  "url_site" text,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "extracao" text,
  "valores" jsonb DEFAULT '[]'::jsonb,
  "erro_msg" text,
  "extracted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."ppp_escolas" ADD CONSTRAINT "ppp_escolas_pkey" PRIMARY KEY (id);
ALTER TABLE public."ppp_escolas" ADD CONSTRAINT "ppp_escolas_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."ppp_escolas" ADD CONSTRAINT "ppp_escolas_fonte_check" CHECK ((fonte = ANY (ARRAY['pdf'::text, 'site'::text, 'json'::text])));
ALTER TABLE public."ppp_escolas" ADD CONSTRAINT "ppp_escolas_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'extraido'::text, 'erro'::text])));
ALTER TABLE public."ppp_escolas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."pulse_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "ciclo_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "pulse_moment" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "due_date" date,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."pulse_assignments" ADD CONSTRAINT "pulse_assignments_ciclo_id_colaborador_id_pulse_moment_key" UNIQUE (ciclo_id, colaborador_id, pulse_moment);
ALTER TABLE public."pulse_assignments" ADD CONSTRAINT "pulse_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE public."pulse_assignments" ADD CONSTRAINT "pulse_assignments_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES pulse_ciclos(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_assignments" ADD CONSTRAINT "pulse_assignments_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_assignments" ADD CONSTRAINT "pulse_assignments_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_assignments" ADD CONSTRAINT "pulse_assignments_pulse_moment_check" CHECK ((pulse_moment = ANY (ARRAY['T0'::text, 'T2'::text])));
ALTER TABLE public."pulse_assignments" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."pulse_audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "actor_email" text NOT NULL,
  "actor_role" text,
  "action_type" text NOT NULL,
  "ciclo_id" uuid,
  "group_key" text,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."pulse_audit_logs" ADD CONSTRAINT "pulse_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."pulse_audit_logs" ADD CONSTRAINT "pulse_audit_logs_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES pulse_ciclos(id) ON DELETE SET NULL;
ALTER TABLE public."pulse_audit_logs" ADD CONSTRAINT "pulse_audit_logs_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_audit_logs" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."pulse_ciclos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "t0_aberto_em" timestamp with time zone,
  "t0_fechado_em" timestamp with time zone,
  "t2_aberto_em" timestamp with time zone,
  "t2_fechado_em" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."pulse_ciclos" ADD CONSTRAINT "pulse_ciclos_pkey" PRIMARY KEY (id);
ALTER TABLE public."pulse_ciclos" ADD CONSTRAINT "pulse_ciclos_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_ciclos" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."pulse_classifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "ciclo_id" uuid NOT NULL,
  "response_id" uuid NOT NULL,
  "pulse_moment" text NOT NULL,
  "classifier_model" text NOT NULL,
  "classifier_themes" text[] DEFAULT '{}'::text[] NOT NULL,
  "classifier_sentiment" text,
  "classifier_evidence" text,
  "classifier_confidence" text DEFAULT 'medium'::text,
  "classifier_raw_response" text,
  "classifier_called_at" timestamp with time zone DEFAULT now(),
  "auditor_model" text,
  "auditor_agrees" boolean,
  "auditor_divergences" jsonb,
  "auditor_confidence_adjusted" text,
  "auditor_notes" text,
  "auditor_called_at" timestamp with time zone,
  "final_confidence" text DEFAULT 'medium'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."pulse_classifications" ADD CONSTRAINT "pulse_classifications_response_id_key" UNIQUE (response_id);
ALTER TABLE public."pulse_classifications" ADD CONSTRAINT "pulse_classifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."pulse_classifications" ADD CONSTRAINT "pulse_classifications_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES pulse_ciclos(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_classifications" ADD CONSTRAINT "pulse_classifications_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_classifications" ADD CONSTRAINT "pulse_classifications_response_id_fkey" FOREIGN KEY (response_id) REFERENCES pulse_responses(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_classifications" ADD CONSTRAINT "pulse_classifications_final_confidence_check" CHECK ((final_confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public."pulse_classifications" ADD CONSTRAINT "pulse_classifications_pulse_moment_check" CHECK ((pulse_moment = ANY (ARRAY['T0'::text, 'T2'::text])));
ALTER TABLE public."pulse_classifications" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."pulse_responses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "ciclo_id" uuid NOT NULL,
  "assignment_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "pulse_moment" text NOT NULL,
  "question_id" text NOT NULL,
  "dimension_key" text NOT NULL,
  "numeric_answer" smallint,
  "text_answer" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_assignment_id_question_id_key" UNIQUE (assignment_id, question_id);
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_pkey" PRIMARY KEY (id);
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES pulse_assignments(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES pulse_ciclos(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_numeric_answer_check" CHECK (((numeric_answer >= 1) AND (numeric_answer <= 5)));
ALTER TABLE public."pulse_responses" ADD CONSTRAINT "pulse_responses_pulse_moment_check" CHECK ((pulse_moment = ANY (ARRAY['T0'::text, 'T2'::text])));
ALTER TABLE public."pulse_responses" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."pulse_triangulations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "ciclo_id" uuid NOT NULL,
  "group_type" text NOT NULL,
  "group_key" text NOT NULL,
  "respondent_count" integer NOT NULL,
  "summary" text,
  "accelerators_json" jsonb DEFAULT '[]'::jsonb,
  "blockers_json" jsonb DEFAULT '[]'::jsonb,
  "alerts_json" jsonb DEFAULT '[]'::jsonb,
  "recommendations_json" jsonb DEFAULT '[]'::jsonb,
  "divergences_json" jsonb DEFAULT '[]'::jsonb,
  "themes_json" jsonb DEFAULT '[]'::jsonb,
  "confidence_level" text DEFAULT 'medium'::text NOT NULL,
  "classifier_model" text,
  "auditor_model" text,
  "computed_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."pulse_triangulations" ADD CONSTRAINT "pulse_triangulations_ciclo_id_group_type_group_key_key" UNIQUE (ciclo_id, group_type, group_key);
ALTER TABLE public."pulse_triangulations" ADD CONSTRAINT "pulse_triangulations_pkey" PRIMARY KEY (id);
ALTER TABLE public."pulse_triangulations" ADD CONSTRAINT "pulse_triangulations_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES pulse_ciclos(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_triangulations" ADD CONSTRAINT "pulse_triangulations_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."pulse_triangulations" ADD CONSTRAINT "pulse_triangulations_confidence_level_check" CHECK ((confidence_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public."pulse_triangulations" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_email" text NOT NULL,
  "action_type" text NOT NULL,
  "target_table" text,
  "target_id" text,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_audit_logs" ADD CONSTRAINT "radarempresas_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_audit_logs" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_caged_cnae_6m" (
  "cnae" text NOT NULL,
  "admissoes_6m" integer DEFAULT 0,
  "desligamentos_6m" integer DEFAULT 0,
  "saldo_6m" integer DEFAULT 0,
  "sal_medio_6m" numeric,
  "volume_6m" integer DEFAULT 0,
  "fonte_version" text DEFAULT 'caged-mov-202510-202603'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_caged_cnae_6m" ADD CONSTRAINT "radarempresas_caged_cnae_6m_pkey" PRIMARY KEY (cnae);
ALTER TABLE public."radarempresas_caged_cnae_6m" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_caged_municipio_6m" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uf" text,
  "municipio_ibge" text NOT NULL,
  "admissoes_6m" integer DEFAULT 0,
  "desligamentos_6m" integer DEFAULT 0,
  "saldo_6m" integer DEFAULT 0,
  "volume_6m" integer DEFAULT 0,
  "fonte_version" text DEFAULT 'caged-mov-202510-202603'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_caged_municipio_6m" ADD CONSTRAINT "radarempresas_caged_municipio_6m_municipio_ibge_key" UNIQUE (municipio_ibge);
ALTER TABLE public."radarempresas_caged_municipio_6m" ADD CONSTRAINT "radarempresas_caged_municipio_6m_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_caged_municipio_6m" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_caged_municipio_cbo_6m" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uf" text,
  "municipio_ibge" text NOT NULL,
  "cbo" text NOT NULL,
  "admissoes_6m" integer DEFAULT 0,
  "desligamentos_6m" integer DEFAULT 0,
  "saldo_6m" integer DEFAULT 0,
  "sal_medio_6m" numeric,
  "volume_6m" integer DEFAULT 0,
  "fonte_version" text DEFAULT 'caged-mov-202510-202603'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_caged_municipio_cbo_6m" ADD CONSTRAINT "radarempresas_caged_municipio_cbo_6m_municipio_ibge_cbo_key" UNIQUE (municipio_ibge, cbo);
ALTER TABLE public."radarempresas_caged_municipio_cbo_6m" ADD CONSTRAINT "radarempresas_caged_municipio_cbo_6m_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_caged_municipio_cbo_6m" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_caged_municipio_cnae_6m" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uf" text,
  "municipio_ibge" text NOT NULL,
  "cnae" text NOT NULL,
  "admissoes_6m" integer DEFAULT 0,
  "desligamentos_6m" integer DEFAULT 0,
  "saldo_6m" integer DEFAULT 0,
  "sal_medio_6m" numeric,
  "volume_6m" integer DEFAULT 0,
  "taxa_mov_proxy" numeric,
  "fonte_version" text DEFAULT 'caged-mov-202510-202603'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_caged_municipio_cnae_6m" ADD CONSTRAINT "radarempresas_caged_municipio_cnae_6m_municipio_ibge_cnae_key" UNIQUE (municipio_ibge, cnae);
ALTER TABLE public."radarempresas_caged_municipio_cnae_6m" ADD CONSTRAINT "radarempresas_caged_municipio_cnae_6m_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_caged_municipio_cnae_6m" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_cidades_agg" (
  "municipio_ibge" text NOT NULL,
  "municipio_nome" text,
  "uf" text,
  "total_ativos" integer,
  "n_priorizados" integer,
  "n_abordar" integer,
  "n_boa" integer,
  "score_medio" numeric,
  "seg_top" text,
  "n_redes" integer,
  "xlsx_path" text,
  "fonte_version" text DEFAULT 'receita-2026-05'::text,
  "updated_at" timestamp with time zone DEFAULT now(),
  "n_priorizados_b2b" integer,
  "head_estimado_b2b" numeric
);
ALTER TABLE public."radarempresas_cidades_agg" ADD CONSTRAINT "radarempresas_cidades_agg_pkey" PRIMARY KEY (municipio_ibge);
ALTER TABLE public."radarempresas_cidades_agg" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_cnae_denylist" (
  "cnae_prefixo" text NOT NULL,
  "prefixo_len" integer NOT NULL,
  "motivo" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_cnae_denylist" ADD CONSTRAINT "radarempresas_cnae_denylist_pkey" PRIMARY KEY (cnae_prefixo);
ALTER TABLE public."radarempresas_cnae_denylist" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_cnae_segmento" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cnae_prefixo" text NOT NULL,
  "prefixo_len" integer NOT NULL,
  "segmento_key" text NOT NULL,
  "people_intensity_score" integer DEFAULT 50,
  "leadership_complexity_score" integer DEFAULT 50,
  "onboarding_need_score" integer DEFAULT 50,
  "standardization_need_score" integer DEFAULT 50,
  "commercial_fit_score" integer DEFAULT 50,
  "is_priority" boolean DEFAULT false,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "subsegmento" text
);
ALTER TABLE public."radarempresas_cnae_segmento" ADD CONSTRAINT "radarempresas_cnae_segmento_cnae_prefixo_key" UNIQUE (cnae_prefixo);
ALTER TABLE public."radarempresas_cnae_segmento" ADD CONSTRAINT "radarempresas_cnae_segmento_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_cnae_segmento" ADD CONSTRAINT "radarempresas_cnae_segmento_segmento_key_fkey" FOREIGN KEY (segmento_key) REFERENCES radarempresas_segmentos(key) ON DELETE CASCADE;
ALTER TABLE public."radarempresas_cnae_segmento" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_cnaes" (
  "codigo" text NOT NULL,
  "descricao" text NOT NULL,
  "divisao" text,
  "grupo" text,
  "classe" text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_cnaes" ADD CONSTRAINT "radarempresas_cnaes_pkey" PRIMARY KEY (codigo);
ALTER TABLE public."radarempresas_cnaes" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_empresas" (
  "cnpj_basico" text NOT NULL,
  "razao_social" text,
  "natureza_juridica" text,
  "qualificacao_responsavel" text,
  "capital_social" numeric,
  "porte_empresa" text,
  "ente_federativo" text,
  "fonte_version" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_empresas" ADD CONSTRAINT "radarempresas_empresas_pkey" PRIMARY KEY (cnpj_basico);
ALTER TABLE public."radarempresas_empresas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_estabelecimentos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cnpj_completo" text NOT NULL,
  "cnpj_basico" text NOT NULL,
  "cnpj_ordem" text,
  "cnpj_dv" text,
  "nome_fantasia" text,
  "is_matriz" boolean DEFAULT false,
  "situacao_cadastral" text,
  "is_active" boolean DEFAULT true,
  "cnae_principal" text,
  "cnae_principal_desc" text,
  "cnaes_secundarios" text[],
  "uf" text,
  "municipio_cod" text,
  "municipio_nome" text,
  "bairro" text,
  "cep" text,
  "email" text,
  "telefone_1" text,
  "telefone_2" text,
  "has_email" boolean DEFAULT false,
  "has_phone" boolean DEFAULT false,
  "has_fantasia" boolean DEFAULT false,
  "data_inicio_atividade" text,
  "company_age_years" integer,
  "fonte_version" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_estabelecimentos" ADD CONSTRAINT "radarempresas_estabelecimentos_cnpj_completo_key" UNIQUE (cnpj_completo);
ALTER TABLE public."radarempresas_estabelecimentos" ADD CONSTRAINT "radarempresas_estabelecimentos_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_estabelecimentos" ADD CONSTRAINT "radarempresas_estabelecimentos_cnpj_basico_fkey" FOREIGN KEY (cnpj_basico) REFERENCES radarempresas_empresas(cnpj_basico) ON DELETE CASCADE;
ALTER TABLE public."radarempresas_estabelecimentos" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_funil_agg" (
  "etapa" text NOT NULL,
  "n" bigint,
  "ordem" integer,
  "fonte_version" text DEFAULT 'receita-2026-05'::text,
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_funil_agg" ADD CONSTRAINT "radarempresas_funil_agg_pkey" PRIMARY KEY (etapa);
ALTER TABLE public."radarempresas_funil_agg" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_insights" (
  "estabelecimento_id" uuid NOT NULL,
  "segmento_key" text,
  "pain_hypotheses" jsonb DEFAULT '[]'::jsonb,
  "recommended_offer" text,
  "approach_angle" text,
  "sales_message_short" text,
  "sales_email_draft" text,
  "linkedin_message" text,
  "objections" jsonb DEFAULT '[]'::jsonb,
  "confidence_level" text DEFAULT 'medium'::text,
  "model_used" text,
  "prompt_version" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_insights" ADD CONSTRAINT "radarempresas_insights_pkey" PRIMARY KEY (estabelecimento_id);
ALTER TABLE public."radarempresas_insights" ADD CONSTRAINT "radarempresas_insights_estabelecimento_id_fkey" FOREIGN KEY (estabelecimento_id) REFERENCES radarempresas_estabelecimentos(id) ON DELETE CASCADE;
ALTER TABLE public."radarempresas_insights" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "job_type" text NOT NULL,
  "status" text DEFAULT 'running'::text,
  "source_name" text,
  "source_version" text,
  "rows_processed" integer DEFAULT 0,
  "rows_inserted" integer DEFAULT 0,
  "rows_failed" integer DEFAULT 0,
  "started_at" timestamp with time zone DEFAULT now(),
  "finished_at" timestamp with time zone,
  "error_message" text,
  "metadata_json" jsonb
);
ALTER TABLE public."radarempresas_jobs" ADD CONSTRAINT "radarempresas_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_jobs" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_lista_itens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lista_id" uuid NOT NULL,
  "estabelecimento_id" uuid NOT NULL,
  "status" text DEFAULT 'new'::text,
  "notas" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_lista_itens" ADD CONSTRAINT "radarempresas_lista_itens_lista_id_estabelecimento_id_key" UNIQUE (lista_id, estabelecimento_id);
ALTER TABLE public."radarempresas_lista_itens" ADD CONSTRAINT "radarempresas_lista_itens_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_lista_itens" ADD CONSTRAINT "radarempresas_lista_itens_estabelecimento_id_fkey" FOREIGN KEY (estabelecimento_id) REFERENCES radarempresas_estabelecimentos(id) ON DELETE CASCADE;
ALTER TABLE public."radarempresas_lista_itens" ADD CONSTRAINT "radarempresas_lista_itens_lista_id_fkey" FOREIGN KEY (lista_id) REFERENCES radarempresas_listas(id) ON DELETE CASCADE;
ALTER TABLE public."radarempresas_lista_itens" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_listas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "owner_email" text NOT NULL,
  "filters_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_listas" ADD CONSTRAINT "radarempresas_listas_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_listas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_municipios" (
  "codigo_receita" text NOT NULL,
  "nome" text NOT NULL,
  "uf" text,
  "codigo_ibge" text,
  "regiao" text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_municipios" ADD CONSTRAINT "radarempresas_municipios_pkey" PRIMARY KEY (codigo_receita);
ALTER TABLE public."radarempresas_municipios" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_rais_estab_cnae" (
  "cnae" text NOT NULL,
  "qtd_estab" integer DEFAULT 0,
  "estoque_vinculos" integer DEFAULT 0,
  "tam_medio_estimado" numeric,
  "fonte_version" text DEFAULT 'rais-estab-pub'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_rais_estab_cnae" ADD CONSTRAINT "radarempresas_rais_estab_cnae_pkey" PRIMARY KEY (cnae);
ALTER TABLE public."radarempresas_rais_estab_cnae" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_rais_estab_municipio" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uf" text,
  "municipio_ibge" text NOT NULL,
  "qtd_estab" integer DEFAULT 0,
  "estoque_vinculos" integer DEFAULT 0,
  "fonte_version" text DEFAULT 'rais-estab-pub'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_rais_estab_municipio" ADD CONSTRAINT "radarempresas_rais_estab_municipio_municipio_ibge_key" UNIQUE (municipio_ibge);
ALTER TABLE public."radarempresas_rais_estab_municipio" ADD CONSTRAINT "radarempresas_rais_estab_municipio_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_rais_estab_municipio" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_rais_estab_municipio_cnae" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uf" text,
  "municipio_ibge" text NOT NULL,
  "cnae" text NOT NULL,
  "qtd_estab" integer DEFAULT 0,
  "estoque_vinculos" integer DEFAULT 0,
  "vinc_medio" numeric,
  "tam_medio_estimado" numeric,
  "fonte_version" text DEFAULT 'rais-estab-pub'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_rais_estab_municipio_cnae" ADD CONSTRAINT "radarempresas_rais_estab_municipio_cnae_municipio_ibge_cnae_key" UNIQUE (municipio_ibge, cnae);
ALTER TABLE public."radarempresas_rais_estab_municipio_cnae" ADD CONSTRAINT "radarempresas_rais_estab_municipio_cnae_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_rais_estab_municipio_cnae" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_rais_estab_municipio_porte" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uf" text,
  "municipio_ibge" text NOT NULL,
  "tam_cod" integer,
  "faixa" text,
  "qtd_estab" integer DEFAULT 0,
  "estoque_vinculos" integer DEFAULT 0,
  "fonte_version" text DEFAULT 'rais-estab-pub'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_rais_estab_municipio_porte" ADD CONSTRAINT "radarempresas_rais_estab_municipio_p_municipio_ibge_tam_cod_key" UNIQUE (municipio_ibge, tam_cod);
ALTER TABLE public."radarempresas_rais_estab_municipio_porte" ADD CONSTRAINT "radarempresas_rais_estab_municipio_porte_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_rais_estab_municipio_porte" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_redes" (
  "marca_norm" text NOT NULL,
  "nome_exibicao" text NOT NULL,
  "n_unidades" integer NOT NULL,
  "n_donos" integer NOT NULL,
  "segmento_key" text,
  "segmento_nome" text,
  "score_medio" numeric,
  "score_max" numeric,
  "classificacao" text,
  "ufs" text[],
  "municipios" text[],
  "exemplo_cnpj" text,
  "confianca_rede" text DEFAULT 'media'::text,
  "fonte_version" text DEFAULT 'receita-2026-05'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "tipo" text DEFAULT 'franquia'::text NOT NULL
);
ALTER TABLE public."radarempresas_redes" ADD CONSTRAINT "radarempresas_redes_pkey" PRIMARY KEY (marca_norm);
ALTER TABLE public."radarempresas_redes" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_scores" (
  "estabelecimento_id" uuid NOT NULL,
  "cnpj_completo" text NOT NULL,
  "score_total" numeric,
  "score_dor_pessoas" numeric,
  "score_capacidade_compra" numeric,
  "score_fit_vertho" numeric,
  "score_contexto_setorial" numeric,
  "classificacao" text,
  "score_explanation" jsonb,
  "scoring_version" text DEFAULT 'v1'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "score_confidence" text,
  "commercial_actionability" numeric,
  "priority_rank" numeric,
  "low_team_probability" boolean DEFAULT false,
  "rede_marca" text
);
ALTER TABLE public."radarempresas_scores" ADD CONSTRAINT "radarempresas_scores_pkey" PRIMARY KEY (estabelecimento_id);
ALTER TABLE public."radarempresas_scores" ADD CONSTRAINT "radarempresas_scores_estabelecimento_id_fkey" FOREIGN KEY (estabelecimento_id) REFERENCES radarempresas_estabelecimentos(id) ON DELETE CASCADE;
ALTER TABLE public."radarempresas_scores" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_segmentos" (
  "key" text NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "priority_level" integer DEFAULT 3,
  "default_pain_hypotheses" jsonb DEFAULT '[]'::jsonb,
  "recommended_offers" jsonb DEFAULT '[]'::jsonb,
  "is_flag_only" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "classificacao_teto" text
);
ALTER TABLE public."radarempresas_segmentos" ADD CONSTRAINT "radarempresas_segmentos_pkey" PRIMARY KEY (key);
ALTER TABLE public."radarempresas_segmentos" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."radarempresas_sidra_cache" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "uf" text,
  "municipio_ibge" text,
  "cnae_grupo" text,
  "ano" integer,
  "indicador_key" text NOT NULL,
  "indicador_nome" text,
  "valor" numeric,
  "fonte_tabela_sidra" text,
  "sidra_query_json" jsonb,
  "fetched_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."radarempresas_sidra_cache" ADD CONSTRAINT "radarempresas_sidra_cache_municipio_ibge_cnae_grupo_ano_ind_key" UNIQUE (municipio_ibge, cnae_grupo, ano, indicador_key);
ALTER TABLE public."radarempresas_sidra_cache" ADD CONSTRAINT "radarempresas_sidra_cache_pkey" PRIMARY KEY (id);
ALTER TABLE public."radarempresas_sidra_cache" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."reavaliacao_sessoes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "competencia_id" uuid NOT NULL,
  "cenario_b_id" uuid,
  "baseline_nivel" integer,
  "baseline_avaliacao" jsonb,
  "status" text DEFAULT 'pendente'::text,
  "historico" jsonb DEFAULT '[]'::jsonb,
  "turno" integer DEFAULT 0,
  "extracao_qualitativa" jsonb,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."reavaliacao_sessoes" ADD CONSTRAINT "reavaliacao_sessoes_pkey" PRIMARY KEY (id);
ALTER TABLE public."reavaliacao_sessoes" ADD CONSTRAINT "reavaliacao_sessoes_cenario_b_id_fkey" FOREIGN KEY (cenario_b_id) REFERENCES banco_cenarios(id);
ALTER TABLE public."reavaliacao_sessoes" ADD CONSTRAINT "reavaliacao_sessoes_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."reavaliacao_sessoes" ADD CONSTRAINT "reavaliacao_sessoes_competencia_id_fkey" FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE;
ALTER TABLE public."reavaliacao_sessoes" ADD CONSTRAINT "reavaliacao_sessoes_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."reavaliacao_sessoes" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."regua_maturidade" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "cargo" text,
  "competencia" text,
  "texto" text,
  "descricao" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."regua_maturidade" ADD CONSTRAINT "regua_maturidade_pkey" PRIMARY KEY (id);
ALTER TABLE public."regua_maturidade" ADD CONSTRAINT "regua_maturidade_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."regua_maturidade" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."relatorios" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid,
  "tipo" text NOT NULL,
  "conteudo" jsonb,
  "gerado_em" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pdf_path" text
);
ALTER TABLE public."relatorios" ADD CONSTRAINT "relatorios_empresa_id_colaborador_id_tipo_key" UNIQUE (empresa_id, colaborador_id, tipo);
ALTER TABLE public."relatorios" ADD CONSTRAINT "relatorios_pkey" PRIMARY KEY (id);
ALTER TABLE public."relatorios" ADD CONSTRAINT "relatorios_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."relatorios" ADD CONSTRAINT "relatorios_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."relatorios" ADD CONSTRAINT "relatorios_tipo_check" CHECK ((tipo = ANY (ARRAY['individual'::text, 'gestor'::text, 'rh'::text, 'plenaria'::text, 'evolucao'::text])));
ALTER TABLE public."relatorios" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."respostas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid,
  "timestamp_resposta" timestamp with time zone,
  "email_colaborador" text,
  "nome_colaborador" text,
  "cargo" text,
  "competencia_id" uuid,
  "competencia_nome" text,
  "preferencia_pdi" text,
  "whatsapp" text,
  "r1_situacao" text,
  "r2_acao" text,
  "r3_raciocinio" text,
  "r4_cis" text,
  "representatividade" numeric,
  "canal" text,
  "d1_nota" numeric,
  "d2_nota" numeric,
  "d3_nota" numeric,
  "d4_nota" numeric,
  "d5_nota" numeric,
  "d6_nota" numeric,
  "nivel_ia4" smallint,
  "nota_ia4" numeric,
  "pontos_fortes" text,
  "pontos_atencao" text,
  "feedback_ia4" text,
  "links_academia" text,
  "payload_ia4" jsonb,
  "valores_status" text,
  "valores_payload" jsonb,
  "status_ia4" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now(),
  "cenario_id" uuid,
  "nivel_simulado" smallint,
  "r1" text,
  "r2" text,
  "r3" text,
  "r4" text,
  "avaliado_em" timestamp with time zone,
  "prompt_version_id" uuid,
  "rodada" smallint DEFAULT 1,
  "avaliacao_ia" jsonb,
  "tipo_resposta" text
);
ALTER TABLE public."respostas" ADD CONSTRAINT "respostas_empresa_colab_comp_unique" UNIQUE (empresa_id, colaborador_id, competencia_id);
ALTER TABLE public."respostas" ADD CONSTRAINT "respostas_pkey" PRIMARY KEY (id);
ALTER TABLE public."respostas" ADD CONSTRAINT "respostas_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public."respostas" ADD CONSTRAINT "respostas_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."respostas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."sessoes_avaliacao" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "competencia_id" uuid,
  "competencia_nome" text,
  "cenario_id" uuid,
  "status" text DEFAULT 'em_andamento'::text NOT NULL,
  "fase" text DEFAULT 'cenario'::text NOT NULL,
  "aprofundamentos" integer DEFAULT 0,
  "confianca" integer DEFAULT 0,
  "evidencias" jsonb DEFAULT '[]'::jsonb,
  "avaliacao_final" jsonb,
  "nivel" integer,
  "nota_decimal" numeric(4,2),
  "lacuna" numeric(3,1),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "rascunho_avaliacao" jsonb,
  "validacao_audit" jsonb,
  "modelo_avaliador" text,
  "modelo_validador" text,
  "check_nota" integer,
  "check_status" text,
  "check_resultado" jsonb
);
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_pkey" PRIMARY KEY (id);
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_cenario_id_fkey" FOREIGN KEY (cenario_id) REFERENCES banco_cenarios(id) ON DELETE SET NULL;
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_competencia_id_fkey" FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE SET NULL;
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_check_status_check" CHECK ((check_status = ANY (ARRAY['aprovado'::text, 'revisar'::text])));
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_fase_check" CHECK ((fase = ANY (ARRAY['cenario'::text, 'aprofundamento'::text, 'contraexemplo'::text, 'encerramento'::text, 'concluida'::text])));
ALTER TABLE public."sessoes_avaliacao" ADD CONSTRAINT "sessoes_avaliacao_status_check" CHECK ((status = ANY (ARRAY['em_andamento'::text, 'concluido'::text, 'erro'::text])));
ALTER TABLE public."sessoes_avaliacao" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."temporada_semana_progresso" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "trilha_id" uuid,
  "empresa_id" uuid,
  "colaborador_id" uuid,
  "semana" integer NOT NULL,
  "tipo" text NOT NULL,
  "status" text DEFAULT 'pendente'::text,
  "conteudo_consumido" boolean DEFAULT false,
  "reflexao" jsonb,
  "feedback" jsonb,
  "iniciado_em" timestamp with time zone,
  "concluido_em" timestamp with time zone,
  "tira_duvidas" jsonb
);
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_trilha_id_semana_key" UNIQUE (trilha_id, semana);
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_pkey" PRIMARY KEY (id);
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_trilha_id_fkey" FOREIGN KEY (trilha_id) REFERENCES trilhas(id) ON DELETE CASCADE;
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_semana_check" CHECK (((semana >= 1) AND (semana <= 14)));
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'concluido'::text])));
ALTER TABLE public."temporada_semana_progresso" ADD CONSTRAINT "temporada_semana_progresso_tipo_check" CHECK ((tipo = ANY (ARRAY['conteudo'::text, 'aplicacao'::text, 'avaliacao'::text])));
ALTER TABLE public."temporada_semana_progresso" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."top10_cargos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "cargo" text NOT NULL,
  "competencia_id" uuid NOT NULL,
  "posicao" smallint,
  "justificativa" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "confianca" numeric,
  "evidencias" jsonb DEFAULT '[]'::jsonb,
  "papel_na_cobertura" text,
  "aderencia_cargo" numeric,
  "aderencia_mercado" numeric,
  "motivo" text
);
ALTER TABLE public."top10_cargos" ADD CONSTRAINT "top10_cargos_empresa_id_cargo_competencia_id_key" UNIQUE (empresa_id, cargo, competencia_id);
ALTER TABLE public."top10_cargos" ADD CONSTRAINT "top10_cargos_pkey" PRIMARY KEY (id);
ALTER TABLE public."top10_cargos" ADD CONSTRAINT "top10_cargos_competencia_id_fkey" FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE;
ALTER TABLE public."top10_cargos" ADD CONSTRAINT "top10_cargos_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."top10_cargos" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."trash" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid,
  "tabela_origem" text NOT NULL,
  "registro_id" uuid,
  "payload" jsonb NOT NULL,
  "deletado_em" timestamp with time zone DEFAULT now(),
  "deletado_por" text,
  "contexto" text
);
ALTER TABLE public."trash" ADD CONSTRAINT "trash_pkey" PRIMARY KEY (id);
ALTER TABLE public."trash" ADD CONSTRAINT "trash_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."trash" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."trilhas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "pdi_id" uuid,
  "cursos" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'pendente'::text,
  "criado_em" timestamp with time zone DEFAULT now(),
  "competencia_foco" text,
  "temporada_plano" jsonb,
  "descritores_selecionados" jsonb,
  "numero_temporada" integer DEFAULT 1,
  "evolution_report" jsonb,
  "evolution_generated_at" timestamp with time zone,
  "data_inicio" date,
  "competencias_foco" text[]
);
ALTER TABLE public."trilhas" ADD CONSTRAINT "trilhas_empresa_id_colaborador_id_key" UNIQUE (empresa_id, colaborador_id);
ALTER TABLE public."trilhas" ADD CONSTRAINT "trilhas_pkey" PRIMARY KEY (id);
ALTER TABLE public."trilhas" ADD CONSTRAINT "trilhas_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."trilhas" ADD CONSTRAINT "trilhas_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."trilhas" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."trilhas_catalogo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid,
  "competencia_id" uuid,
  "titulo" text,
  "url" text,
  "tipo" text,
  "descricao" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."trilhas_catalogo" ADD CONSTRAINT "trilhas_catalogo_pkey" PRIMARY KEY (id);
ALTER TABLE public."trilhas_catalogo" ADD CONSTRAINT "trilhas_catalogo_competencia_id_fkey" FOREIGN KEY (competencia_id) REFERENCES competencias(id);
ALTER TABLE public."trilhas_catalogo" ADD CONSTRAINT "trilhas_catalogo_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."trilhas_catalogo" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."videos_watched" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "colaborador_id" uuid,
  "empresa_id" uuid,
  "video_id" text NOT NULL,
  "event_type" text,
  "video_length" integer,
  "seconds_watched" integer,
  "country" text,
  "os" text,
  "browser" text,
  "raw_payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."videos_watched" ADD CONSTRAINT "videos_watched_pkey" PRIMARY KEY (id);
ALTER TABLE public."videos_watched" ADD CONSTRAINT "videos_watched_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE public."videos_watched" ADD CONSTRAINT "videos_watched_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE public."videos_watched" ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."votacao_competencias" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "cargo" text NOT NULL,
  "competencias_escolhidas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sugestao_nova" text,
  "votado_em" timestamp with time zone DEFAULT now(),
  "device_type" text,
  "user_agent" text,
  "ip_hash" text
);
ALTER TABLE public."votacao_competencias" ADD CONSTRAINT "votacao_competencias_empresa_id_colaborador_id_key" UNIQUE (empresa_id, colaborador_id);
ALTER TABLE public."votacao_competencias" ADD CONSTRAINT "votacao_competencias_pkey" PRIMARY KEY (id);
ALTER TABLE public."votacao_competencias" ENABLE ROW LEVEL SECURITY;

-- ── Índices ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS _tmp_mercado_escola_raw_codigo_inep_idx ON public._tmp_mercado_escola_raw USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS _tmp_mercado_escola_raw_municipio_ibge_rede_idx ON public._tmp_mercado_escola_raw USING btree (municipio_ibge, rede);
CREATE INDEX IF NOT EXISTS _tmp_mercado_escola_raw_uf_rede_idx ON public._tmp_mercado_escola_raw USING btree (uf, rede);
CREATE INDEX IF NOT EXISTS idx_academia_empresa ON public.academia USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_acao ON public.admin_audit_log USING btree (acao, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.admin_audit_log USING btree (admin_email, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_criado ON public.admin_audit_log USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_empresa ON public.admin_audit_log USING btree (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_banco_cenarios_empresa ON public.banco_cenarios USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cenarios_empresa ON public.banco_cenarios USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cenarios_empresa_comp_cargo ON public.banco_cenarios USING btree (empresa_id, competencia_id, cargo);
CREATE INDEX IF NOT EXISTS idx_capacitacao_email ON public.capacitacao USING btree (empresa_id, email);
CREATE INDEX IF NOT EXISTS idx_capacitacao_empresa ON public.capacitacao USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_capacitacao_semana ON public.capacitacao USING btree (empresa_id, email, semana);
CREATE INDEX IF NOT EXISTS idx_cargos_empresa ON public.cargos USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cargos_empresa_empresa ON public.cargos_empresa USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_gestor ON public.checkpoints_gestor USING btree (gestor_id, status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_trilha ON public.checkpoints_gestor USING btree (trilha_id);
CREATE INDEX IF NOT EXISTS idx_cis_ia_ref_empresa ON public.cis_ia_referencia USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cis_ref_empresa ON public.cis_referencia USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS ix_colab_otp_expires ON public.colab_otp USING btree (expires_at);
CREATE INDEX IF NOT EXISTS ix_colab_otp_lookup ON public.colab_otp USING btree (empresa_id, telefone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_colaboradores_email ON public.colaboradores USING btree (empresa_id, email);
CREATE INDEX IF NOT EXISTS idx_colaboradores_empresa ON public.colaboradores USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_locale ON public.colaboradores USING btree (locale) WHERE (locale IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_colaboradores_perfil_externo_fonte ON public.colaboradores USING btree (perfil_externo_fonte) WHERE (perfil_externo_fonte IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_colaboradores_role ON public.colaboradores USING btree (empresa_id, role);
CREATE INDEX IF NOT EXISTS idx_colaboradores_tutorados_ids ON public.colaboradores USING gin (tutorados_ids);
CREATE UNIQUE INDEX IF NOT EXISTS uq_colab_wa_telefone ON public.colaboradores USING btree (empresa_id, telefone) WHERE login_por_whatsapp;
CREATE INDEX IF NOT EXISTS idx_competencias_cod ON public.competencias USING btree (empresa_id, cod_comp);
CREATE INDEX IF NOT EXISTS idx_competencias_empresa ON public.competencias USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_comp_base_segmento ON public.competencias_base USING btree (segmento);
CREATE INDEX IF NOT EXISTS idx_da_colab ON public.descriptor_assessments USING btree (colaborador_id, competencia);
CREATE INDEX IF NOT EXISTS idx_diag_analises_scope ON public.diag_analises_ia USING btree (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_diag_censo_docentes_ano ON public.diag_censo_docentes USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_censo_docentes_doc_bas ON public.diag_censo_docentes USING btree (ano DESC, qt_doc_bas DESC);
CREATE INDEX IF NOT EXISTS idx_diag_censo_docentes_inep_ano ON public.diag_censo_docentes USING btree (codigo_inep, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_censo_ano ON public.diag_censo_infra USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_censo_inep ON public.diag_censo_infra USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_censo_matriculas ON public.diag_censo_infra USING btree (matriculas DESC) WHERE (matriculas IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_diag_enem_escola_ano ON public.diag_enem_escola_snapshots USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_enem_escola_municipio_ano ON public.diag_enem_escola_snapshots USING btree (municipio_ibge, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_enem_escola_uf_ano ON public.diag_enem_escola_snapshots USING btree (uf, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_busca ON public.diag_escolas USING gin (to_tsvector('portuguese'::regconfig, nome));
CREATE INDEX IF NOT EXISTS idx_diag_escolas_microrregiao ON public.diag_escolas USING btree (microrregiao);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_municipio ON public.diag_escolas USING btree (municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_municipio_norm_gin ON public.diag_escolas USING gin (lower(f_unaccent(municipio)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_municipio_trgm ON public.diag_escolas USING gin (municipio gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_nome_norm_gin ON public.diag_escolas USING gin (lower(f_unaccent(nome)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_nome_trgm ON public.diag_escolas USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_uf ON public.diag_escolas USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_uf_codigo_inep ON public.diag_escolas USING btree (uf, codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_eventos_data ON public.diag_eventos USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_eventos_scope ON public.diag_eventos USING btree (scope_type, scope_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_eventos_tipo_data ON public.diag_eventos USING btree (tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_rec_ano ON public.diag_fundeb_receita_prevista USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_rec_uf ON public.diag_fundeb_receita_prevista USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_rec_vaar ON public.diag_fundeb_receita_prevista USING btree (complementacao_vaar) WHERE (complementacao_vaar > (0)::numeric);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_ano ON public.diag_fundeb_repasses USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_uf ON public.diag_fundeb_repasses USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_diag_vaar_ano ON public.diag_fundeb_vaar USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_vaar_beneficiario ON public.diag_fundeb_vaar USING btree (beneficiario) WHERE (beneficiario IS TRUE);
CREATE INDEX IF NOT EXISTS idx_diag_vaar_uf ON public.diag_fundeb_vaar USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_diag_ica_municipio ON public.diag_ica_snapshots USING btree (municipio_ibge, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_ica_uf ON public.diag_ica_snapshots USING btree (uf, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_ano ON public.diag_ideb_metas USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_inep ON public.diag_ideb_metas USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_status ON public.diag_ideb_metas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_escola_ano ON public.diag_ideb_snapshots USING btree (codigo_inep, ano DESC) WHERE (codigo_inep IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_etapa_ano ON public.diag_ideb_snapshots USING btree (etapa, ano);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_municipio_ano ON public.diag_ideb_snapshots USING btree (municipio_ibge, ano DESC) WHERE (municipio_ibge IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_uf_ano ON public.diag_ideb_snapshots USING btree (uf, ano DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_ideb_unique ON public.diag_ideb_snapshots USING btree (chave);
CREATE INDEX IF NOT EXISTS idx_diag_ingest_fonte ON public.diag_ingest_runs USING btree (fonte, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_ingest_status ON public.diag_ingest_runs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_diag_leads_criado ON public.diag_leads USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_leads_email ON public.diag_leads USING btree (email);
CREATE INDEX IF NOT EXISTS idx_diag_leads_scope ON public.diag_leads USING btree (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_diag_leads_status ON public.diag_leads USING btree (pdf_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_inf_saeb_pk ON public.diag_mv_escola_infra_saeb USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_mv_inf_saeb_quadrante ON public.diag_mv_escola_infra_saeb USING btree (quadrante);
CREATE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_inse ON public.diag_mv_escola_metricas USING btree (uf, inse_grupo);
CREATE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_micro ON public.diag_mv_escola_metricas USING btree (uf, microrregiao);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_pk ON public.diag_mv_escola_metricas USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_uf ON public.diag_mv_escola_metricas USING btree (uf);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_escola_saeb_inep ON public.diag_mv_escola_saeb_agg USING btree (codigo_inep);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_estado_stats_uf ON public.diag_mv_estado_stats USING btree (uf);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mercado_escola_inep ON public.diag_mv_mercado_escola USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_mv_mercado_escola_inse ON public.diag_mv_mercado_escola USING btree (inse_efetivo);
CREATE INDEX IF NOT EXISTS idx_mv_mercado_escola_municipio ON public.diag_mv_mercado_escola USING btree (municipio_ibge, rede);
CREATE INDEX IF NOT EXISTS idx_mv_mercado_escola_uf ON public.diag_mv_mercado_escola USING btree (uf, rede);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mercado_municipio_ibge ON public.diag_mv_mercado_municipio USING btree (municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_mv_mercado_municipio_uf ON public.diag_mv_mercado_municipio USING btree (uf);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mercado_rede_pk ON public.diag_mv_mercado_rede USING btree (municipio_ibge, rede);
CREATE INDEX IF NOT EXISTS idx_mv_mercado_rede_uf ON public.diag_mv_mercado_rede USING btree (uf, rede);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_municipio_ica_ibge ON public.diag_mv_municipio_ica_recent USING btree (municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_mv_mun_metricas_micro ON public.diag_mv_municipio_metricas USING btree (uf, microrregiao);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_mun_metricas_pk ON public.diag_mv_municipio_metricas USING btree (municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_mv_mun_metricas_uf ON public.diag_mv_municipio_metricas USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_diag_mv_mun_metr_municipal_micro ON public.diag_mv_municipio_metricas_municipal USING btree (uf, microrregiao);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_mun_metr_municipal_pk ON public.diag_mv_municipio_metricas_municipal USING btree (municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_mv_mun_metr_municipal_uf ON public.diag_mv_municipio_metricas_municipal USING btree (uf);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_municipio_saeb_ibge ON public.diag_mv_municipio_saeb_agg USING btree (municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_mv_municipio_saeb_uf ON public.diag_mv_municipio_saeb_agg USING btree (uf);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_radar_counts_singleton ON public.diag_mv_radar_counts USING btree (singleton_key);
CREATE INDEX IF NOT EXISTS idx_diag_pdde_mun_ano ON public.diag_pdde_municipal USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_pdde_mun_uf ON public.diag_pdde_municipal USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_diag_pdde_ano ON public.diag_pdde_repasses USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_pdde_inep ON public.diag_pdde_repasses USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_saeb_disciplina ON public.diag_saeb_snapshots USING btree (ano, etapa, disciplina);
CREATE INDEX IF NOT EXISTS idx_diag_saeb_escola_ano ON public.diag_saeb_snapshots USING btree (codigo_inep, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_saresp_ano ON public.diag_saresp_snapshots USING btree (ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_saresp_codigo_sp ON public.diag_saresp_snapshots USING btree (codigo_sp);
CREATE INDEX IF NOT EXISTS idx_diag_saresp_disc ON public.diag_saresp_snapshots USING btree (ano, serie, disciplina);
CREATE INDEX IF NOT EXISTS idx_diag_saresp_inep ON public.diag_saresp_snapshots USING btree (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_empresas_default_locale ON public.empresas USING btree (default_locale);
CREATE INDEX IF NOT EXISTS idx_empresas_slug ON public.empresas USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_envios_empresa ON public.envios_diagnostico USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_evolucao_comp ON public.evolucao USING btree (empresa_id, competencia_id);
CREATE INDEX IF NOT EXISTS idx_evolucao_email ON public.evolucao USING btree (empresa_id, email);
CREATE INDEX IF NOT EXISTS idx_evolucao_empresa ON public.evolucao USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_evo_desc_comp ON public.evolucao_descritores USING btree (empresa_id, email, competencia_id);
CREATE INDEX IF NOT EXISTS idx_evo_desc_email ON public.evolucao_descritores USING btree (empresa_id, email);
CREATE INDEX IF NOT EXISTS idx_evo_desc_empresa ON public.evolucao_descritores USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fase4_envios_colab ON public.fase4_envios USING btree (colaborador_id, status);
CREATE INDEX IF NOT EXISTS idx_fase4_envios_email ON public.fase4_envios USING btree (empresa_id, email);
CREATE INDEX IF NOT EXISTS idx_fase4_envios_empresa ON public.fase4_envios USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fase4_envios_status ON public.fase4_envios USING btree (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_fit_cargo ON public.fit_resultados USING btree (empresa_id, cargo_nome);
CREATE INDEX IF NOT EXISTS idx_fit_colab ON public.fit_resultados USING btree (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_fit_empresa ON public.fit_resultados USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_ia_usage_colab_feat ON public.ia_usage_log USING btree (colaborador_id, feature, created_at);
CREATE INDEX IF NOT EXISTS idx_ia_usage_empresa_created ON public.ia_usage_log USING btree (empresa_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kb_categoria ON public.knowledge_base USING btree (empresa_id, categoria);
CREATE INDEX IF NOT EXISTS idx_kb_embedding ON public.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists='50');
CREATE INDEX IF NOT EXISTS idx_kb_empresa ON public.knowledge_base USING btree (empresa_id) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_kb_trgm_titulo ON public.knowledge_base USING gin (titulo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_kb_tsv ON public.knowledge_base USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_mensagens_sessao ON public.mensagens_chat USING btree (sessao_id);
CREATE INDEX IF NOT EXISTS idx_msgs_sessao ON public.mensagens_chat USING btree (sessao_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mc_ativo ON public.micro_conteudos USING btree (ativo) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_mc_bunny ON public.micro_conteudos USING btree (bunny_video_id) WHERE (bunny_video_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_mc_competencia ON public.micro_conteudos USING btree (competencia, descritor);
CREATE INDEX IF NOT EXISTS idx_mc_contexto ON public.micro_conteudos USING btree (contexto, cargo, setor);
CREATE INDEX IF NOT EXISTS idx_mc_empresa ON public.micro_conteudos USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_mc_formato ON public.micro_conteudos USING btree (formato);
CREATE INDEX IF NOT EXISTS idx_mc_nivel ON public.micro_conteudos USING btree (nivel_min, nivel_max);
CREATE INDEX IF NOT EXISTS idx_pdis_colab ON public.pdis USING btree (colaborador_id, status);
CREATE INDEX IF NOT EXISTS idx_permission_overrides_permission ON public.permission_overrides USING btree (permission_key);
CREATE INDEX IF NOT EXISTS idx_permission_overrides_scope ON public.permission_overrides USING btree (scope_type, scope_key);
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppp_escolas_unique ON public.ppp_escolas USING btree (empresa_id, escola);
CREATE INDEX IF NOT EXISTS idx_pulse_assignments_ciclo_status ON public.pulse_assignments USING btree (ciclo_id, pulse_moment, status);
CREATE INDEX IF NOT EXISTS idx_pulse_assignments_colab ON public.pulse_assignments USING btree (colaborador_id, status);
CREATE INDEX IF NOT EXISTS idx_pulse_audit_empresa ON public.pulse_audit_logs USING btree (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_ciclos_empresa ON public.pulse_ciclos USING btree (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_pulse_cls_ciclo_momento ON public.pulse_classifications USING btree (ciclo_id, pulse_moment);
CREATE INDEX IF NOT EXISTS idx_pulse_cls_themes ON public.pulse_classifications USING gin (classifier_themes);
CREATE INDEX IF NOT EXISTS idx_pulse_mv_aggregates_ciclo ON public.pulse_mv_aggregates USING btree (empresa_id, ciclo_id, pulse_moment);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_mv_aggregates_uk ON public.pulse_mv_aggregates USING btree (empresa_id, ciclo_id, group_type, group_key, pulse_moment, dimension_key);
CREATE INDEX IF NOT EXISTS idx_pulse_responses_ciclo_momento ON public.pulse_responses USING btree (ciclo_id, pulse_moment);
CREATE INDEX IF NOT EXISTS idx_pulse_responses_dimensao ON public.pulse_responses USING btree (ciclo_id, pulse_moment, dimension_key);
CREATE INDEX IF NOT EXISTS idx_pulse_tri_ciclo ON public.pulse_triangulations USING btree (ciclo_id);
CREATE INDEX IF NOT EXISTS idx_radaremp_audit_created ON public.radarempresas_audit_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radaremp_caged_mc_cnae ON public.radarempresas_caged_municipio_cnae_6m USING btree (cnae);
CREATE INDEX IF NOT EXISTS idx_radaremp_cid_prio ON public.radarempresas_cidades_agg USING btree (n_priorizados DESC);
CREATE INDEX IF NOT EXISTS idx_radaremp_cid_uf ON public.radarempresas_cidades_agg USING btree (uf);
CREATE INDEX IF NOT EXISTS idx_radaremp_cnaeseg_prefixo ON public.radarempresas_cnae_segmento USING btree (prefixo_len DESC, cnae_prefixo);
CREATE INDEX IF NOT EXISTS idx_radaremp_estab_basico ON public.radarempresas_estabelecimentos USING btree (cnpj_basico);
CREATE INDEX IF NOT EXISTS idx_radaremp_estab_cnae ON public.radarempresas_estabelecimentos USING btree (cnae_principal);
CREATE INDEX IF NOT EXISTS idx_radaremp_estab_uf_mun ON public.radarempresas_estabelecimentos USING btree (uf, municipio_cod);
CREATE INDEX IF NOT EXISTS idx_radaremp_listaitens_lista ON public.radarempresas_lista_itens USING btree (lista_id, status);
CREATE INDEX IF NOT EXISTS idx_radaremp_mun_ibge ON public.radarempresas_municipios USING btree (codigo_ibge);
CREATE INDEX IF NOT EXISTS idx_radaremp_rais_mc_cnae ON public.radarempresas_rais_estab_municipio_cnae USING btree (cnae);
CREATE INDEX IF NOT EXISTS idx_radaremp_redes_score ON public.radarempresas_redes USING btree (score_medio DESC);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_classif ON public.radarempresas_scores USING btree (classificacao);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_confidence ON public.radarempresas_scores USING btree (score_confidence);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_priority ON public.radarempresas_scores USING btree (priority_rank DESC);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_rede ON public.radarempresas_scores USING btree (rede_marca) WHERE (rede_marca IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_total ON public.radarempresas_scores USING btree (score_total DESC);
CREATE INDEX IF NOT EXISTS idx_reav_sessoes_colab ON public.reavaliacao_sessoes USING btree (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_reav_sessoes_empresa ON public.reavaliacao_sessoes USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_regua_empresa ON public.regua_maturidade USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_empresa ON public.relatorios USING btree (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS idx_respostas_colab ON public.respostas USING btree (empresa_id, email_colaborador);
CREATE INDEX IF NOT EXISTS idx_respostas_empresa ON public.respostas USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_active ON public.sessoes_avaliacao USING btree (colaborador_id, competencia_id, status) WHERE (status = 'em_andamento'::text);
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_colab ON public.sessoes_avaliacao USING btree (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_comp ON public.sessoes_avaliacao USING btree (competencia_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_empresa ON public.sessoes_avaliacao USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_colab ON public.sessoes_avaliacao USING btree (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_empresa ON public.sessoes_avaliacao USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_status ON public.sessoes_avaliacao USING btree (status);
CREATE INDEX IF NOT EXISTS idx_tsp_colab ON public.temporada_semana_progresso USING btree (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_tsp_trilha ON public.temporada_semana_progresso USING btree (trilha_id);
CREATE INDEX IF NOT EXISTS idx_top10_empresa_cargo ON public.top10_cargos USING btree (empresa_id, cargo);
CREATE INDEX IF NOT EXISTS idx_trash_empresa ON public.trash USING btree (empresa_id, deletado_em DESC);
CREATE INDEX IF NOT EXISTS idx_trash_tabela ON public.trash USING btree (tabela_origem);
CREATE INDEX IF NOT EXISTS idx_vw_colab ON public.videos_watched USING btree (colaborador_id, video_id);
CREATE INDEX IF NOT EXISTS idx_vw_empresa ON public.videos_watched USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_vw_video ON public.videos_watched USING btree (video_id);
CREATE INDEX IF NOT EXISTS idx_votacao_comp_cargo ON public.votacao_competencias USING btree (empresa_id, cargo);
CREATE INDEX IF NOT EXISTS idx_votacao_comp_empresa ON public.votacao_competencias USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_votacao_device ON public.votacao_competencias USING btree (empresa_id, device_type) WHERE (device_type IS NOT NULL);

-- ── Policies (RLS) ──────────────────────────────────────────────────────
CREATE POLICY "academia_delete" ON public."academia" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "academia_insert" ON public."academia" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "academia_select" ON public."academia" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "academia_update" ON public."academia" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_audit_permissive" ON public."admin_audit_log" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "admin_full_cenarios" ON public."banco_cenarios" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "banco_cenarios_delete" ON public."banco_cenarios" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "banco_cenarios_insert" ON public."banco_cenarios" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "banco_cenarios_select" ON public."banco_cenarios" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "banco_cenarios_update" ON public."banco_cenarios" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "capacitacao_delete" ON public."capacitacao" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "capacitacao_insert" ON public."capacitacao" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "capacitacao_select" ON public."capacitacao" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "capacitacao_update" ON public."capacitacao" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "cargos_delete" ON public."cargos" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "cargos_insert" ON public."cargos" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "cargos_select" ON public."cargos" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "cargos_update" ON public."cargos" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_full_cargos" ON public."cargos_empresa" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "admin_cat_enr" ON public."catalogo_enriquecido" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "cis_ia_referencia_delete" ON public."cis_ia_referencia" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "cis_ia_referencia_insert" ON public."cis_ia_referencia" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "cis_ia_referencia_select" ON public."cis_ia_referencia" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "cis_ia_referencia_update" ON public."cis_ia_referencia" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "cis_referencia_delete" ON public."cis_referencia" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "cis_referencia_insert" ON public."cis_referencia" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "cis_referencia_select" ON public."cis_referencia" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "cis_referencia_update" ON public."cis_referencia" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_cobertura" ON public."cobertura_conteudo" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "colaboradores_delete" ON public."colaboradores" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "colaboradores_insert" ON public."colaboradores" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "colaboradores_select" ON public."colaboradores" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "colaboradores_select_same_tenant" ON public."colaboradores" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = current_empresa_id()));
CREATE POLICY "colaboradores_update" ON public."colaboradores" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "colaboradores_update_self" ON public."colaboradores" AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = current_colaborador_id())) WITH CHECK ((id = current_colaborador_id()));
CREATE POLICY "authenticated_select_competencias" ON public."competencias" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "competencias_delete" ON public."competencias" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "competencias_insert" ON public."competencias" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "competencias_select" ON public."competencias" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "competencias_update" ON public."competencias" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "authenticated_select_competencias_base" ON public."competencias_base" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "da_service_all" ON public."descriptor_assessments" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "diag_censo_docentes_public_read" ON public."diag_censo_docentes" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_censo_public_read" ON public."diag_censo_infra" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_enem_escola_public_read" ON public."diag_enem_escola_snapshots" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_escolas_public_read" ON public."diag_escolas" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_fundeb_rec_public_read" ON public."diag_fundeb_receita_prevista" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_fundeb_public_read" ON public."diag_fundeb_repasses" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_vaar_public_read" ON public."diag_fundeb_vaar" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_ica_public_read" ON public."diag_ica_snapshots" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_ideb_public_read" ON public."diag_ideb_metas" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_ideb_public_read" ON public."diag_ideb_snapshots" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_pdde_mun_public_read" ON public."diag_pdde_municipal" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_pdde_public_read" ON public."diag_pdde_repasses" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_saeb_public_read" ON public."diag_saeb_snapshots" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "diag_saresp_public_read" ON public."diag_saresp_snapshots" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "empresas_delete" ON public."empresas" AS PERMISSIVE FOR DELETE TO authenticated USING ((id = get_empresa_id()));
CREATE POLICY "empresas_insert" ON public."empresas" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = get_empresa_id()));
CREATE POLICY "empresas_select" ON public."empresas" AS PERMISSIVE FOR SELECT TO authenticated USING ((id = get_empresa_id()));
CREATE POLICY "empresas_select_same_tenant" ON public."empresas" AS PERMISSIVE FOR SELECT TO authenticated USING ((id = current_empresa_id()));
CREATE POLICY "empresas_update" ON public."empresas" AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = get_empresa_id())) WITH CHECK ((id = get_empresa_id()));
CREATE POLICY "admin_full_envios" ON public."envios_diagnostico" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "envios_diagnostico_delete" ON public."envios_diagnostico" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "envios_diagnostico_insert" ON public."envios_diagnostico" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "envios_diagnostico_select" ON public."envios_diagnostico" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "envios_diagnostico_update" ON public."envios_diagnostico" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_full_evolucao" ON public."evolucao" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "evolucao_delete" ON public."evolucao" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "evolucao_insert" ON public."evolucao" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "evolucao_select" ON public."evolucao" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "evolucao_update" ON public."evolucao" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_full_evolucao_desc" ON public."evolucao_descritores" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "evolucao_descritores_delete" ON public."evolucao_descritores" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "evolucao_descritores_insert" ON public."evolucao_descritores" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "evolucao_descritores_select" ON public."evolucao_descritores" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "evolucao_descritores_update" ON public."evolucao_descritores" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "fase4_envios_delete" ON public."fase4_envios" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "fase4_envios_insert" ON public."fase4_envios" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "fase4_envios_select" ON public."fase4_envios" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "fase4_envios_update" ON public."fase4_envios" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_full_fit" ON public."fit_resultados" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "kb_tenant_isolation" ON public."knowledge_base" AS PERMISSIVE FOR ALL TO public USING ((empresa_id IN ( SELECT colaboradores.empresa_id
   FROM colaboradores
  WHERE ((auth.jwt() ->> 'email'::text) = colaboradores.email))));
CREATE POLICY "admin_full_mensagens" ON public."mensagens_chat" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "mensagens_chat_select_same_tenant" ON public."mensagens_chat" AS PERMISSIVE FOR SELECT TO authenticated USING (can_read_sessao_avaliacao(sessao_id));
CREATE POLICY "msgs_chat_tenant" ON public."mensagens_chat" AS PERMISSIVE FOR ALL TO public USING ((sessao_id IN ( SELECT sessoes_avaliacao.id
   FROM sessoes_avaliacao
  WHERE (sessoes_avaliacao.empresa_id = get_empresa_id()))));
CREATE POLICY "mc_authenticated_read" ON public."micro_conteudos" AS PERMISSIVE FOR SELECT TO authenticated USING ((ativo = true));
CREATE POLICY "mc_service_all" ON public."micro_conteudos" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_moodle_cat" ON public."moodle_catalogo" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "ppp_escolas_tenant" ON public."ppp_escolas" AS PERMISSIVE FOR ALL TO public USING ((empresa_id = get_empresa_id()));
CREATE POLICY "radarempresas_audit_logs_permissive" ON public."radarempresas_audit_logs" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_caged_cnae_6m_perm" ON public."radarempresas_caged_cnae_6m" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_caged_municipio_6m_perm" ON public."radarempresas_caged_municipio_6m" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_caged_municipio_cbo_6m_perm" ON public."radarempresas_caged_municipio_cbo_6m" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_caged_municipio_cnae_6m_perm" ON public."radarempresas_caged_municipio_cnae_6m" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radaremp_cid_perm" ON public."radarempresas_cidades_agg" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_cnae_denylist_perm" ON public."radarempresas_cnae_denylist" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_cnae_segmento_permissive" ON public."radarempresas_cnae_segmento" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_cnaes_permissive" ON public."radarempresas_cnaes" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_empresas_permissive" ON public."radarempresas_empresas" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_estabelecimentos_permissive" ON public."radarempresas_estabelecimentos" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radaremp_fun_perm" ON public."radarempresas_funil_agg" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_insights_permissive" ON public."radarempresas_insights" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_jobs_permissive" ON public."radarempresas_jobs" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_lista_itens_permissive" ON public."radarempresas_lista_itens" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_listas_permissive" ON public."radarempresas_listas" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_municipios_permissive" ON public."radarempresas_municipios" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_rais_estab_cnae_perm" ON public."radarempresas_rais_estab_cnae" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_rais_estab_municipio_perm" ON public."radarempresas_rais_estab_municipio" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_rais_estab_municipio_cnae_perm" ON public."radarempresas_rais_estab_municipio_cnae" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_rais_estab_municipio_porte_perm" ON public."radarempresas_rais_estab_municipio_porte" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_redes_perm" ON public."radarempresas_redes" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_scores_permissive" ON public."radarempresas_scores" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_segmentos_permissive" ON public."radarempresas_segmentos" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "radarempresas_sidra_cache_permissive" ON public."radarempresas_sidra_cache" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "regua_maturidade_delete" ON public."regua_maturidade" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "regua_maturidade_insert" ON public."regua_maturidade" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "regua_maturidade_select" ON public."regua_maturidade" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "regua_maturidade_update" ON public."regua_maturidade" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_full_relatorios" ON public."relatorios" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "admin_full_respostas" ON public."respostas" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "respostas_delete" ON public."respostas" AS PERMISSIVE FOR DELETE TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "respostas_insert" ON public."respostas" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "respostas_select" ON public."respostas" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = get_empresa_id()));
CREATE POLICY "respostas_update" ON public."respostas" AS PERMISSIVE FOR UPDATE TO authenticated USING ((empresa_id = get_empresa_id())) WITH CHECK ((empresa_id = get_empresa_id()));
CREATE POLICY "admin_full_sessoes" ON public."sessoes_avaliacao" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "sessoes_aval_tenant" ON public."sessoes_avaliacao" AS PERMISSIVE FOR ALL TO public USING ((empresa_id = get_empresa_id()));
CREATE POLICY "sessoes_avaliacao_select_same_tenant" ON public."sessoes_avaliacao" AS PERMISSIVE FOR SELECT TO authenticated USING ((empresa_id = current_empresa_id()));
CREATE POLICY "tsp_service_all" ON public."temporada_semana_progresso" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_full_top10" ON public."top10_cargos" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "trash_service_all" ON public."trash" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_trilhas" ON public."trilhas" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "votacao_competencias_all" ON public."votacao_competencias" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

-- ── Funções ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.array_to_halfvec(numeric[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(integer[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(double precision[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(real[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(integer[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(numeric[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(real[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(double precision[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(numeric[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(integer[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(real[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(double precision[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.binary_quantize(vector)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$binary_quantize$function$
;

CREATE OR REPLACE FUNCTION public.binary_quantize(halfvec)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_binary_quantize$function$
;

CREATE OR REPLACE FUNCTION public.can_read_sessao_avaliacao(sessao uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sessoes_avaliacao s
    WHERE s.id = sessao
      AND s.empresa_id = public.current_empresa_id()
  )
$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.current_colaborador_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id
  FROM public.colaboradores c
  WHERE lower(c.email) = lower(auth.email())
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.current_empresa_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.empresa_id
  FROM public.colaboradores c
  WHERE lower(c.email) = lower(auth.email())
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.diag_buscar_escolas(p_termo text, p_uf text DEFAULT NULL::text, p_limit integer DEFAULT 25)
 RETURNS TABLE(codigo_inep text, nome text, municipio text, uf text, rede text, score real)
 LANGUAGE sql
 STABLE
AS $function$
  WITH q AS (
    SELECT trim(lower(public.f_unaccent(p_termo))) AS termo_norm
  )
  SELECT e.codigo_inep::TEXT, e.nome, e.municipio, e.uf, e.rede::TEXT,
    similarity(lower(public.f_unaccent(e.nome)), (SELECT termo_norm FROM q))::REAL AS score
  FROM diag_escolas e
  WHERE (p_uf IS NULL OR e.uf = p_uf)
    AND (
      -- Cada token (palavra de 2+ chars) deve aparecer no nome normalizado,
      -- em qualquer ordem. Tokens com 1 char são ignorados.
      SELECT bool_and(lower(public.f_unaccent(e.nome)) LIKE '%' || tk || '%')
      FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
      WHERE length(tk) >= 2
    )
  ORDER BY score DESC NULLS LAST, e.nome ASC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_buscar_escolas_avancado(p_termo text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_municipio_ibge text DEFAULT NULL::text, p_rede text DEFAULT NULL::text, p_etapa text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(codigo_inep text, nome text, municipio text, municipio_ibge text, uf text, rede text, etapas text[], inse_grupo integer, score real)
 LANGUAGE sql
 STABLE
AS $function$
  WITH q AS (
    SELECT
      trim(lower(public.f_unaccent(coalesce(p_termo, '')))) AS termo_norm,
      coalesce(p_termo, '') = '' OR trim(p_termo) = '' AS sem_termo
  )
  SELECT
    e.codigo_inep::TEXT,
    e.nome,
    e.municipio,
    e.municipio_ibge::TEXT,
    e.uf,
    e.rede::TEXT,
    e.etapas::TEXT[],
    e.inse_grupo,
    CASE
      WHEN (SELECT sem_termo FROM q) THEN 0::REAL
      ELSE similarity(lower(public.f_unaccent(e.nome)), (SELECT termo_norm FROM q))::REAL
    END AS score
  FROM diag_escolas e
  WHERE (p_uf IS NULL OR e.uf = p_uf)
    AND (p_municipio_ibge IS NULL OR e.municipio_ibge = p_municipio_ibge)
    AND (p_rede IS NULL OR e.rede = p_rede)
    AND (
      p_etapa IS NULL
      OR e.etapas && ARRAY[p_etapa]
      OR EXISTS (
        SELECT 1 FROM diag_saeb_snapshots s
        WHERE s.codigo_inep = e.codigo_inep AND s.etapa = p_etapa
      )
      OR (p_etapa = '3_EM' AND EXISTS (
        SELECT 1 FROM diag_enem_escola_snapshots en
        WHERE en.codigo_inep = e.codigo_inep
      ))
    )
    AND (
      (SELECT sem_termo FROM q)
      OR (
        SELECT bool_and(lower(public.f_unaccent(e.nome)) LIKE '%' || tk || '%')
        FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
        WHERE length(tk) >= 2
      )
    )
  ORDER BY
    CASE WHEN (SELECT sem_termo FROM q) THEN 0 ELSE 1 END DESC,
    score DESC NULLS LAST,
    e.nome ASC
  LIMIT p_limit OFFSET p_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_buscar_escolas_avancado_count(p_termo text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_municipio_ibge text DEFAULT NULL::text, p_rede text DEFAULT NULL::text, p_etapa text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  WITH q AS (
    SELECT
      trim(lower(public.f_unaccent(coalesce(p_termo, '')))) AS termo_norm,
      coalesce(p_termo, '') = '' OR trim(p_termo) = '' AS sem_termo
  )
  SELECT COUNT(*)::INT
  FROM diag_escolas e
  WHERE (p_uf IS NULL OR e.uf = p_uf)
    AND (p_municipio_ibge IS NULL OR e.municipio_ibge = p_municipio_ibge)
    AND (p_rede IS NULL OR e.rede = p_rede)
    AND (
      p_etapa IS NULL
      OR e.etapas && ARRAY[p_etapa]
      OR EXISTS (
        SELECT 1 FROM diag_saeb_snapshots s
        WHERE s.codigo_inep = e.codigo_inep AND s.etapa = p_etapa
      )
      OR (p_etapa = '3_EM' AND EXISTS (
        SELECT 1 FROM diag_enem_escola_snapshots en
        WHERE en.codigo_inep = e.codigo_inep
      ))
    )
    AND (
      (SELECT sem_termo FROM q)
      OR (
        SELECT bool_and(lower(public.f_unaccent(e.nome)) LIKE '%' || tk || '%')
        FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
        WHERE length(tk) >= 2
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.diag_buscar_municipios(p_termo text, p_uf text DEFAULT NULL::text, p_limit integer DEFAULT 60)
 RETURNS TABLE(municipio_ibge text, municipio text, uf text, score real)
 LANGUAGE sql
 STABLE
AS $function$
  WITH q AS (
    SELECT trim(lower(public.f_unaccent(p_termo))) AS termo_norm
  ),
  candidatos AS (
    SELECT DISTINCT ON (e.municipio_ibge)
      e.municipio_ibge::TEXT AS municipio_ibge,
      e.municipio,
      e.uf,
      similarity(lower(public.f_unaccent(e.municipio)), (SELECT termo_norm FROM q))::REAL AS score
    FROM diag_escolas e
    WHERE e.municipio_ibge IS NOT NULL
      AND (p_uf IS NULL OR e.uf = p_uf)
      AND (
        SELECT bool_and(lower(public.f_unaccent(e.municipio)) LIKE '%' || tk || '%')
        FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
        WHERE length(tk) >= 2
      )
    ORDER BY e.municipio_ibge, score DESC NULLS LAST
  )
  SELECT c.municipio_ibge, c.municipio, c.uf, c.score
  FROM candidatos c
  ORDER BY c.score DESC NULLS LAST, c.municipio ASC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_count_municipios_distintos()
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(DISTINCT municipio_ibge)
  FROM diag_escolas
  WHERE municipio_ibge IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_escola_benchmarks(p_inep text)
 RETURNS TABLE(scope text, ideb_5ef numeric, ideb_9ef numeric, ideb_3em numeric, saeb_5ef_lp numeric, saeb_5ef_mat numeric, saeb_9ef_lp numeric, saeb_9ef_mat numeric, saeb_3em_lp numeric, saeb_3em_mat numeric, qtd_escolas integer, inse_grupo smallint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH alvo AS (
    SELECT * FROM diag_mv_escola_metricas WHERE codigo_inep = p_inep
  )
  SELECT 'escola' AS scope,
    a.ideb_5ef, a.ideb_9ef, a.ideb_3em,
    a.saeb_5ef_lp, a.saeb_5ef_mat,
    a.saeb_9ef_lp, a.saeb_9ef_mat,
    a.saeb_3em_lp, a.saeb_3em_mat,
    1, a.inse_grupo
  FROM alvo a
  UNION ALL
  SELECT 'microrregiao',
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.saeb_3em_lp)::NUMERIC, AVG(m.saeb_3em_mat)::NUMERIC,
    COUNT(*)::INTEGER, (SELECT inse_grupo FROM alvo)
  FROM diag_mv_escola_metricas m
  JOIN alvo a ON m.uf = a.uf AND m.microrregiao = a.microrregiao
  WHERE m.codigo_inep <> p_inep
    AND (a.inse_grupo IS NULL OR m.inse_grupo = a.inse_grupo)
  UNION ALL
  SELECT 'estado',
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.saeb_3em_lp)::NUMERIC, AVG(m.saeb_3em_mat)::NUMERIC,
    COUNT(*)::INTEGER, (SELECT inse_grupo FROM alvo)
  FROM diag_mv_escola_metricas m
  JOIN alvo a ON m.uf = a.uf
  WHERE m.codigo_inep <> p_inep
    AND (a.inse_grupo IS NULL OR m.inse_grupo = a.inse_grupo);
$function$
;

CREATE OR REPLACE FUNCTION public.diag_escola_pares_cidade(p_inep text, p_limit integer DEFAULT 10)
 RETURNS TABLE(codigo_inep text, nome text, rede text, is_target boolean, saeb_lp numeric, saeb_mat numeric, saeb_geral numeric, ideb_principal numeric, rank_geral integer, total_pares integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH alvo AS (
    SELECT m.*, e.nome AS escola_nome, e.rede AS escola_rede
    FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE m.codigo_inep = p_inep
  ),
  candidatos AS (
    -- Mesma cidade + mesmo INSE; sem INSE: cai pra mesma cidade qualquer
    SELECT m.codigo_inep, e.nome, e.rede,
      m.saeb_5ef_lp, m.saeb_5ef_mat,
      m.saeb_9ef_lp, m.saeb_9ef_mat,
      m.saeb_3em_lp, m.saeb_3em_mat,
      m.ideb_5ef, m.ideb_9ef, m.ideb_3em
    FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    JOIN alvo a ON e.municipio_ibge = (SELECT municipio_ibge FROM diag_escolas WHERE codigo_inep = p_inep)
    WHERE (a.inse_grupo IS NULL OR m.inse_grupo = a.inse_grupo)
  ),
  -- Decide qual etapa usar pra ordenar — preferência da escola alvo
  etapa_alvo AS (
    SELECT
      CASE
        WHEN saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL THEN '9_EF'
        WHEN saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL THEN '5_EF'
        WHEN saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL THEN '3_EM'
        ELSE '5_EF'
      END AS etapa
    FROM alvo
  ),
  ranked AS (
    SELECT
      c.codigo_inep,
      c.nome,
      c.rede,
      (c.codigo_inep = p_inep) AS is_target,
      CASE (SELECT etapa FROM etapa_alvo)
        WHEN '5_EF' THEN c.saeb_5ef_lp
        WHEN '9_EF' THEN c.saeb_9ef_lp
        WHEN '3_EM' THEN c.saeb_3em_lp
      END AS saeb_lp,
      CASE (SELECT etapa FROM etapa_alvo)
        WHEN '5_EF' THEN c.saeb_5ef_mat
        WHEN '9_EF' THEN c.saeb_9ef_mat
        WHEN '3_EM' THEN c.saeb_3em_mat
      END AS saeb_mat,
      CASE (SELECT etapa FROM etapa_alvo)
        WHEN '5_EF' THEN c.ideb_5ef
        WHEN '9_EF' THEN c.ideb_9ef
        WHEN '3_EM' THEN c.ideb_3em
      END AS ideb_principal
    FROM candidatos c
  ),
  com_geral AS (
    SELECT *,
      CASE
        WHEN saeb_lp IS NOT NULL AND saeb_mat IS NOT NULL THEN (saeb_lp + saeb_mat)/2
        WHEN saeb_lp IS NOT NULL THEN saeb_lp
        WHEN saeb_mat IS NOT NULL THEN saeb_mat
        ELSE NULL
      END AS saeb_geral
    FROM ranked
  ),
  com_rank AS (
    SELECT *,
      RANK() OVER (ORDER BY saeb_geral DESC NULLS LAST)::INTEGER AS rank_geral,
      COUNT(*) OVER () AS total_pares
    FROM com_geral
  ),
  -- Inclui sempre a target + top-(p_limit-1) pares
  selecionados AS (
    SELECT * FROM com_rank WHERE is_target
    UNION ALL
    SELECT * FROM com_rank WHERE NOT is_target
    ORDER BY is_target DESC, rank_geral ASC
    LIMIT p_limit
  )
  SELECT
    s.codigo_inep, s.nome, s.rede, s.is_target,
    s.saeb_lp, s.saeb_mat, s.saeb_geral, s.ideb_principal,
    s.rank_geral, s.total_pares::INTEGER
  FROM selecionados s
  ORDER BY s.rank_geral ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_funil_resumo(dias integer DEFAULT 30)
 RETURNS TABLE(tipo text, total bigint, total_humanos bigint, unicos_ip_24h bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    e.tipo,
    COUNT(*)                                 AS total,
    COUNT(*) FILTER (WHERE NOT e.is_bot)     AS total_humanos,
    COUNT(DISTINCT e.ip_hash)
      FILTER (WHERE e.criado_em > now() - interval '24 hours') AS unicos_ip_24h
  FROM diag_eventos e
  WHERE e.criado_em > now() - (dias || ' days')::interval
  GROUP BY e.tipo
  ORDER BY total DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_funil_top_visitados(dias integer DEFAULT 30, lim integer DEFAULT 20)
 RETURNS TABLE(scope_type text, scope_id text, total_views bigint, views_humanos bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    e.scope_type,
    e.scope_id,
    COUNT(*)                              AS total_views,
    COUNT(*) FILTER (WHERE NOT e.is_bot)  AS views_humanos
  FROM diag_eventos e
  WHERE e.tipo IN ('view_escola','view_municipio','view_estado')
    AND e.criado_em > now() - (dias || ' days')::interval
    AND e.scope_id IS NOT NULL
  GROUP BY e.scope_type, e.scope_id
  ORDER BY views_humanos DESC, total_views DESC
  LIMIT lim;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_listar_municipios(p_uf text)
 RETURNS TABLE(municipio_ibge text, municipio text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT DISTINCT ON (e.municipio_ibge)
    e.municipio_ibge::TEXT,
    e.municipio
  FROM diag_escolas e
  WHERE e.uf = p_uf
    AND e.municipio_ibge IS NOT NULL
  ORDER BY e.municipio_ibge, e.municipio;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_municipio_benchmarks(p_ibge text)
 RETURNS TABLE(scope text, ica_taxa numeric, ideb_5ef numeric, ideb_9ef numeric, ideb_3em numeric, saeb_5ef_lp numeric, saeb_5ef_mat numeric, saeb_9ef_lp numeric, saeb_9ef_mat numeric, fundeb_aluno numeric, qtd_munis integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH alvo AS (
    SELECT * FROM diag_mv_municipio_metricas WHERE municipio_ibge = p_ibge
  )
  SELECT 'cidade' AS scope,
    a.ica_taxa, a.ideb_5ef, a.ideb_9ef, a.ideb_3em,
    a.saeb_5ef_lp, a.saeb_5ef_mat, a.saeb_9ef_lp, a.saeb_9ef_mat,
    a.fundeb_aluno, 1
  FROM alvo a
  UNION ALL
  SELECT 'microrregiao',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas m
  JOIN alvo a ON m.uf = a.uf AND m.microrregiao = (SELECT microrregiao FROM diag_mv_municipio_metricas WHERE municipio_ibge = p_ibge)
  UNION ALL
  SELECT 'estado',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas m
  WHERE m.uf = (SELECT uf FROM diag_mv_municipio_metricas WHERE municipio_ibge = p_ibge)
  UNION ALL
  SELECT 'brasil',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas m;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_municipio_benchmarks_municipal(p_ibge text)
 RETURNS TABLE(scope text, ica_taxa numeric, ideb_5ef numeric, ideb_9ef numeric, ideb_3em numeric, saeb_5ef_lp numeric, saeb_5ef_mat numeric, saeb_9ef_lp numeric, saeb_9ef_mat numeric, enem_media_geral numeric, fundeb_aluno numeric, qtd_munis integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH alvo AS (
    SELECT * FROM diag_mv_municipio_metricas_municipal WHERE municipio_ibge = p_ibge
  )
  SELECT 'cidade' AS scope,
    a.ica_taxa, a.ideb_5ef, a.ideb_9ef, a.ideb_3em,
    a.saeb_5ef_lp, a.saeb_5ef_mat, a.saeb_9ef_lp, a.saeb_9ef_mat,
    a.enem_media_geral, a.fundeb_aluno, 1
  FROM alvo a
  UNION ALL
  SELECT 'microrregiao',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m
  JOIN alvo a ON m.uf = a.uf AND m.microrregiao = (SELECT microrregiao FROM diag_mv_municipio_metricas_municipal WHERE municipio_ibge = p_ibge)
  UNION ALL
  SELECT 'estado',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m
  WHERE m.uf = (SELECT uf FROM diag_mv_municipio_metricas_municipal WHERE municipio_ibge = p_ibge)
  UNION ALL
  SELECT 'brasil',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_municipio_stats_etapa(p_ibge text, p_etapa text)
 RETURNS TABLE(qtd_escolas integer, saeb_lp_avg numeric, saeb_lp_stddev numeric, saeb_lp_min numeric, saeb_lp_max numeric, saeb_mat_avg numeric, saeb_mat_stddev numeric, saeb_mat_min numeric, saeb_mat_max numeric, ideb_avg numeric, ideb_stddev numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH escolas AS (
    SELECT m.* FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  lp AS (
    SELECT
      CASE p_etapa WHEN '5_EF' THEN saeb_5ef_lp WHEN '9_EF' THEN saeb_9ef_lp WHEN '3_EM' THEN saeb_3em_lp END AS v
    FROM escolas
  ),
  mat AS (
    SELECT
      CASE p_etapa WHEN '5_EF' THEN saeb_5ef_mat WHEN '9_EF' THEN saeb_9ef_mat WHEN '3_EM' THEN saeb_3em_mat END AS v
    FROM escolas
  ),
  ideb AS (
    SELECT
      CASE p_etapa WHEN '5_EF' THEN ideb_5ef WHEN '9_EF' THEN ideb_9ef WHEN '3_EM' THEN ideb_3em END AS v
    FROM escolas
  )
  SELECT
    (SELECT COUNT(*) FROM escolas WHERE
      (CASE p_etapa WHEN '5_EF' THEN saeb_5ef_lp WHEN '9_EF' THEN saeb_9ef_lp WHEN '3_EM' THEN saeb_3em_lp END) IS NOT NULL
      OR (CASE p_etapa WHEN '5_EF' THEN saeb_5ef_mat WHEN '9_EF' THEN saeb_9ef_mat WHEN '3_EM' THEN saeb_3em_mat END) IS NOT NULL
    )::INTEGER AS qtd_escolas,
    (SELECT AVG(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_avg,
    (SELECT STDDEV_SAMP(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_stddev,
    (SELECT MIN(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_min,
    (SELECT MAX(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_max,
    (SELECT AVG(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_avg,
    (SELECT STDDEV_SAMP(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_stddev,
    (SELECT MIN(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_min,
    (SELECT MAX(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_max,
    (SELECT AVG(v)::NUMERIC FROM ideb WHERE v IS NOT NULL) AS ideb_avg,
    (SELECT STDDEV_SAMP(v)::NUMERIC FROM ideb WHERE v IS NOT NULL) AS ideb_stddev;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_qualidade_distinct_chave(p_tabela text, p_chave text, p_ano integer)
 RETURNS TABLE(distintos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  -- Whitelist de tabelas e chaves para evitar SQL injection via parâmetro.
  tabelas_validas TEXT[] := ARRAY[
    'diag_saeb_snapshots','diag_censo_infra','diag_censo_docentes',
    'diag_enem_escola_snapshots','diag_ideb_metas','diag_saresp_snapshots',
    'diag_pdde_repasses','diag_ica_snapshots','diag_fundeb_repasses',
    'diag_fundeb_vaar','diag_fundeb_receita_prevista','diag_pdde_municipal'
  ];
  chaves_validas TEXT[] := ARRAY['codigo_inep','municipio_ibge'];
BEGIN
  IF NOT (p_tabela = ANY(tabelas_validas)) THEN
    RAISE EXCEPTION 'tabela não permitida: %', p_tabela;
  END IF;
  IF NOT (p_chave = ANY(chaves_validas)) THEN
    RAISE EXCEPTION 'chave não permitida: %', p_chave;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT COUNT(DISTINCT %I)::BIGINT AS distintos FROM %I WHERE ano = $1',
    p_chave, p_tabela
  ) USING p_ano;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_qualidade_municipios_distintos()
 RETURNS TABLE(total bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(DISTINCT municipio_ibge)::BIGINT
  FROM (
    SELECT municipio_ibge FROM diag_escolas WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_ica_snapshots         WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_fundeb_repasses       WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_fundeb_vaar           WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_fundeb_receita_prevista WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_pdde_municipal        WHERE municipio_ibge IS NOT NULL
  ) m;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_rede_por_inse(p_ibge text)
 RETURNS TABLE(inse_grupo smallint, qtd_escolas integer, saeb_lp_avg numeric, saeb_mat_avg numeric, ideb_avg numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH base AS (
    SELECT m.* FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  etapa_pick AS (
    SELECT etapa FROM (
      SELECT '5_EF' AS etapa, COUNT(*) AS n FROM base WHERE saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL
      UNION ALL
      SELECT '9_EF', COUNT(*) FROM base WHERE saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL
      UNION ALL
      SELECT '3_EM', COUNT(*) FROM base WHERE saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL
    ) sub WHERE n > 0 ORDER BY n DESC LIMIT 1
  )
  SELECT
    b.inse_grupo,
    COUNT(*)::INTEGER AS qtd_escolas,
    AVG(CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_lp WHEN '9_EF' THEN b.saeb_9ef_lp WHEN '3_EM' THEN b.saeb_3em_lp END)::NUMERIC AS saeb_lp_avg,
    AVG(CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_mat WHEN '9_EF' THEN b.saeb_9ef_mat WHEN '3_EM' THEN b.saeb_3em_mat END)::NUMERIC AS saeb_mat_avg,
    AVG(CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.ideb_5ef WHEN '9_EF' THEN b.ideb_9ef WHEN '3_EM' THEN b.ideb_3em END)::NUMERIC AS ideb_avg
  FROM base b
  WHERE b.inse_grupo IS NOT NULL
  GROUP BY b.inse_grupo
  ORDER BY b.inse_grupo;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_rede_ranking(p_ibge text, p_limit integer DEFAULT 5)
 RETURNS TABLE(codigo_inep text, nome text, rede text, inse_grupo smallint, saeb_geral numeric, saeb_lp numeric, saeb_mat numeric, ideb numeric, rank_total integer, qtd_total integer, posicao text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH base AS (
    SELECT m.*, e.nome, e.rede AS rede_nome
    FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  etapa_pick AS (
    SELECT etapa FROM (
      SELECT '5_EF' AS etapa, COUNT(*) AS n FROM base WHERE saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL
      UNION ALL
      SELECT '9_EF', COUNT(*) FROM base WHERE saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL
      UNION ALL
      SELECT '3_EM', COUNT(*) FROM base WHERE saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL
    ) sub WHERE n > 0 ORDER BY n DESC LIMIT 1
  ),
  com_valores AS (
    SELECT
      b.codigo_inep, b.nome, b.rede_nome AS rede, b.inse_grupo,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_lp WHEN '9_EF' THEN b.saeb_9ef_lp WHEN '3_EM' THEN b.saeb_3em_lp END AS saeb_lp,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_mat WHEN '9_EF' THEN b.saeb_9ef_mat WHEN '3_EM' THEN b.saeb_3em_mat END AS saeb_mat,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.ideb_5ef WHEN '9_EF' THEN b.ideb_9ef WHEN '3_EM' THEN b.ideb_3em END AS ideb
    FROM base b
  ),
  com_geral AS (
    SELECT *,
      CASE WHEN saeb_lp IS NOT NULL AND saeb_mat IS NOT NULL THEN (saeb_lp + saeb_mat)/2
           WHEN saeb_lp IS NOT NULL THEN saeb_lp
           WHEN saeb_mat IS NOT NULL THEN saeb_mat
      END AS saeb_geral
    FROM com_valores
    WHERE saeb_lp IS NOT NULL OR saeb_mat IS NOT NULL
  ),
  ranked AS (
    SELECT *,
      RANK() OVER (ORDER BY saeb_geral DESC NULLS LAST)::INTEGER AS rank_total,
      COUNT(*) OVER ()::INTEGER AS qtd_total
    FROM com_geral
  ),
  top_n AS (
    SELECT *, 'top'::TEXT AS posicao FROM ranked ORDER BY rank_total ASC LIMIT p_limit
  ),
  bottom_n AS (
    SELECT *, 'bottom'::TEXT AS posicao FROM ranked ORDER BY rank_total DESC LIMIT p_limit
  ),
  selecionadas AS (
    SELECT * FROM top_n
    UNION ALL
    SELECT * FROM bottom_n
  )
  SELECT codigo_inep, nome, rede, inse_grupo,
    saeb_geral, saeb_lp, saeb_mat, ideb,
    rank_total, qtd_total, posicao
  FROM selecionadas
  ORDER BY rank_total ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_rede_stats(p_ibge text)
 RETURNS TABLE(qtd_escolas integer, saeb_lp_avg numeric, saeb_lp_stddev numeric, saeb_lp_min numeric, saeb_lp_max numeric, saeb_lp_p25 numeric, saeb_lp_p75 numeric, saeb_mat_avg numeric, saeb_mat_stddev numeric, saeb_mat_min numeric, saeb_mat_max numeric, saeb_mat_p25 numeric, saeb_mat_p75 numeric, ideb_avg numeric, ideb_stddev numeric, ideb_min numeric, ideb_max numeric, etapa text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH base AS (
    SELECT m.* FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  -- Detecta etapa principal: a com mais escolas com Saeb (5_EF tipicamente)
  etapa_pick AS (
    SELECT etapa FROM (
      SELECT '5_EF' AS etapa, COUNT(*) AS n FROM base WHERE saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL
      UNION ALL
      SELECT '9_EF', COUNT(*) FROM base WHERE saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL
      UNION ALL
      SELECT '3_EM', COUNT(*) FROM base WHERE saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL
    ) sub WHERE n > 0 ORDER BY n DESC LIMIT 1
  ),
  vals AS (
    SELECT
      (SELECT etapa FROM etapa_pick) AS etapa,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN saeb_5ef_lp WHEN '9_EF' THEN saeb_9ef_lp WHEN '3_EM' THEN saeb_3em_lp END AS lp,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN saeb_5ef_mat WHEN '9_EF' THEN saeb_9ef_mat WHEN '3_EM' THEN saeb_3em_mat END AS mat,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN ideb_5ef WHEN '9_EF' THEN ideb_9ef WHEN '3_EM' THEN ideb_3em END AS ideb
    FROM base
  )
  SELECT
    COUNT(*) FILTER (WHERE lp IS NOT NULL OR mat IS NOT NULL)::INTEGER AS qtd_escolas,
    AVG(lp)::NUMERIC,    STDDEV_SAMP(lp)::NUMERIC,    MIN(lp)::NUMERIC,    MAX(lp)::NUMERIC,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY lp)::NUMERIC,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY lp)::NUMERIC,
    AVG(mat)::NUMERIC,   STDDEV_SAMP(mat)::NUMERIC,   MIN(mat)::NUMERIC,   MAX(mat)::NUMERIC,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY mat)::NUMERIC,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY mat)::NUMERIC,
    AVG(ideb)::NUMERIC,  STDDEV_SAMP(ideb)::NUMERIC,  MIN(ideb)::NUMERIC,  MAX(ideb)::NUMERIC,
    (SELECT etapa FROM etapa_pick)
  FROM vals
  WHERE lp IS NOT NULL OR mat IS NOT NULL OR ideb IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.empresa_perfil_externo_fonte(p_empresa_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (sys_config->>'perfil_externo_fonte')::TEXT
    FROM empresas
   WHERE id = p_empresa_id;
$function$
;

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$                                                                                     
  BEGIN
    EXECUTE query;
    RETURN 'OK';
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
  SELECT public.unaccent('public.unaccent', $1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_empresa_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'empresa_id')::UUID,
    (auth.jwt() ->> 'empresa_id')::UUID
  )
$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

CREATE OR REPLACE FUNCTION public.halfvec(halfvec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_accum(double precision[], halfvec)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_accum$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_add(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_add$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_avg(double precision[])
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_avg$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_cmp(halfvec, halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cmp$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_concat(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_concat$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_eq(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_eq$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_ge(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ge$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_gt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_gt$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_in(cstring, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_in$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_l2_squared_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_le(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_le$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_lt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_lt$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_mul(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_mul$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_ne(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ne$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_negative_inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_out(halfvec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_out$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_recv(internal, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_recv$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_send(halfvec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_send$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_spherical_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_spherical_distance$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_sub(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_sub$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_float4(halfvec, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_float4$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_sparsevec(halfvec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_vector(halfvec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.hamming_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$hamming_distance$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_bit_support$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_halfvec_support$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_sparsevec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_sparsevec_support$function$
;

CREATE OR REPLACE FUNCTION public.hnswhandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$hnswhandler$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$inner_product$function$
;

CREATE OR REPLACE FUNCTION public.ivfflat_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_bit_support$function$
;

CREATE OR REPLACE FUNCTION public.ivfflat_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_halfvec_support$function$
;

CREATE OR REPLACE FUNCTION public.ivfflathandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$ivfflathandler$function$
;

CREATE OR REPLACE FUNCTION public.jaccard_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$jaccard_distance$function$
;

CREATE OR REPLACE FUNCTION public.kb_search(p_empresa_id uuid, p_query text, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, titulo text, conteudo text, categoria text, score real)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.titulo,
    kb.conteudo,
    kb.categoria,
    ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) AS score
  FROM knowledge_base kb
  WHERE kb.empresa_id = p_empresa_id
    AND kb.ativo = true
    AND kb.tsv @@ plainto_tsquery('portuguese', p_query)
  ORDER BY score DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.kb_search_hybrid(p_empresa_id uuid, p_query text, p_query_embedding vector, p_limit integer DEFAULT 5, p_k integer DEFAULT 60)
 RETURNS TABLE(id uuid, titulo text, conteudo text, categoria text, score real)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH fts AS (
    SELECT kb.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) DESC) AS rnk
    FROM knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true
      AND kb.tsv @@ plainto_tsquery('portuguese', p_query)
    LIMIT p_limit * 4
  ),
  sem AS (
    SELECT kb.id,
           ROW_NUMBER() OVER (ORDER BY kb.embedding <=> p_query_embedding) AS rnk
    FROM knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true
      AND kb.embedding IS NOT NULL
    ORDER BY kb.embedding <=> p_query_embedding
    LIMIT p_limit * 4
  ),
  fused AS (
    SELECT id,
           SUM(1.0 / (p_k + rnk))::REAL AS score
    FROM (SELECT id, rnk FROM fts UNION ALL SELECT id, rnk FROM sem) u
    GROUP BY id
    ORDER BY score DESC
    LIMIT p_limit
  )
  SELECT
    kb.id,
    kb.titulo,
    kb.conteudo,
    kb.categoria,
    f.score
  FROM fused f
  JOIN knowledge_base kb ON kb.id = f.id
  ORDER BY f.score DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.kb_search_semantic(p_empresa_id uuid, p_query_embedding vector, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, titulo text, conteudo text, categoria text, score real)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.titulo,
    kb.conteudo,
    kb.categoria,
    (1 - (kb.embedding <=> p_query_embedding))::REAL AS score
  FROM knowledge_base kb
  WHERE kb.empresa_id = p_empresa_id
    AND kb.ativo = true
    AND kb.embedding IS NOT NULL
  ORDER BY kb.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_norm(halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_norm$function$
;

CREATE OR REPLACE FUNCTION public.l2_norm(sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_norm$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(sparsevec)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.refresh_diag_mvs()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_ica_recent;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_estado_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_metricas;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_metricas_municipal;
EXCEPTION
  WHEN feature_not_supported THEN
    -- fallback: refresh sem CONCURRENTLY se algum índice único faltar
    REFRESH MATERIALIZED VIEW diag_mv_escola_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_ica_recent;
    REFRESH MATERIALIZED VIEW diag_mv_estado_stats;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas_municipal;
END $function$
;

CREATE OR REPLACE FUNCTION public.refresh_mv_mercado_potencial()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  TRUNCATE TABLE _tmp_mercado_escola_raw;
  INSERT INTO _tmp_mercado_escola_raw
  WITH censo_docentes_latest AS (
    SELECT DISTINCT ON (codigo_inep) * FROM diag_censo_docentes ORDER BY codigo_inep, ano DESC
  ),
  censo_infra_latest AS (
    SELECT DISTINCT ON (codigo_inep) * FROM diag_censo_infra ORDER BY codigo_inep, ano DESC
  )
  SELECT
    e.codigo_inep, e.nome, e.municipio, e.municipio_ibge, e.uf, e.rede, e.microrregiao,
    e.inse_grupo, e.etapas,
    COALESCE(d.qt_doc_bas, 0),
    COALESCE(d.qt_doc_bas_0_24, 0) + COALESCE(d.qt_doc_bas_25_29, 0),
    COALESCE(d.qt_doc_bas_esco_sup_pos_espec, 0) + COALESCE(d.qt_doc_bas_esco_sup_pos_mestra, 0) + COALESCE(d.qt_doc_bas_esco_sup_pos_douto, 0),
    COALESCE((i.quantidades->>'QT_PROF_COORDENADOR')::int, 0) + COALESCE((i.quantidades->>'QT_PROF_PEDAGOGIA')::int, 0),
    1,
    i.score_conectividade, i.score_pedagogica, i.score_basica,
    COALESCE((i.indicadores->>'IN_CLIMATIZACAO')::int, 0),
    COALESCE((i.indicadores->>'IN_LABORATORIO_CIENCIAS')::int, 0),
    COALESCE((i.indicadores->>'IN_QUADRA_ESPORTES_COBERTA')::int, 0),
    COALESCE((i.indicadores->>'IN_AUDITORIO')::int, 0),
    COALESCE((i.quantidades->>'QT_DESKTOP_ALUNO')::int, 0) + COALESCE((i.quantidades->>'QT_COMP_PORTATIL_ALUNO')::int, 0) + COALESCE((i.quantidades->>'QT_TABLET_ALUNO')::int, 0),
    COALESCE(d.qt_doc_bas_0_24, 0)
  FROM diag_escolas e
  LEFT JOIN censo_docentes_latest d ON d.codigo_inep = e.codigo_inep
  LEFT JOIN censo_infra_latest i ON i.codigo_inep = e.codigo_inep
  WHERE e.status = 'ativa';
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_escola;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_municipio;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_rede;
END $function$
;

CREATE OR REPLACE FUNCTION public.refresh_pulse_aggregates()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY pulse_mv_aggregates;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

CREATE OR REPLACE FUNCTION public.set_permission_overrides_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec(sparsevec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_cmp(sparsevec, sparsevec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cmp$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_eq(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_eq$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_ge(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ge$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_gt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_gt$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_in(cstring, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_in$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_l2_squared_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_le(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_le$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_lt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_lt$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_ne(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ne$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_negative_inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_out(sparsevec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_out$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_recv(internal, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_recv$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_send(sparsevec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_send$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_to_halfvec(sparsevec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_to_vector(sparsevec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.subvector(vector, integer, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$subvector$function$
;

CREATE OR REPLACE FUNCTION public.subvector(halfvec, integer, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_subvector$function$
;

CREATE OR REPLACE FUNCTION public.trg_mc_updated()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.unaccent(text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
;

CREATE OR REPLACE FUNCTION public.unaccent(regdictionary, text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
;

CREATE OR REPLACE FUNCTION public.unaccent_init(internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_init$function$
;

CREATE OR REPLACE FUNCTION public.unaccent_lexize(internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_lexize$function$
;

CREATE OR REPLACE FUNCTION public.update_kb_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.vector(vector, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector$function$
;

CREATE OR REPLACE FUNCTION public.vector_accum(double precision[], vector)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_accum$function$
;

CREATE OR REPLACE FUNCTION public.vector_add(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_add$function$
;

CREATE OR REPLACE FUNCTION public.vector_avg(double precision[])
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_avg$function$
;

CREATE OR REPLACE FUNCTION public.vector_cmp(vector, vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_cmp$function$
;

CREATE OR REPLACE FUNCTION public.vector_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
;

CREATE OR REPLACE FUNCTION public.vector_concat(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_concat$function$
;

CREATE OR REPLACE FUNCTION public.vector_dims(halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_vector_dims$function$
;

CREATE OR REPLACE FUNCTION public.vector_dims(vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_dims$function$
;

CREATE OR REPLACE FUNCTION public.vector_eq(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_eq$function$
;

CREATE OR REPLACE FUNCTION public.vector_ge(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ge$function$
;

CREATE OR REPLACE FUNCTION public.vector_gt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_gt$function$
;

CREATE OR REPLACE FUNCTION public.vector_in(cstring, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_in$function$
;

CREATE OR REPLACE FUNCTION public.vector_l2_squared_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.vector_le(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_le$function$
;

CREATE OR REPLACE FUNCTION public.vector_lt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_lt$function$
;

CREATE OR REPLACE FUNCTION public.vector_mul(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_mul$function$
;

CREATE OR REPLACE FUNCTION public.vector_ne(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ne$function$
;

CREATE OR REPLACE FUNCTION public.vector_negative_inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.vector_norm(vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_norm$function$
;

CREATE OR REPLACE FUNCTION public.vector_out(vector)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_out$function$
;

CREATE OR REPLACE FUNCTION public.vector_recv(internal, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_recv$function$
;

CREATE OR REPLACE FUNCTION public.vector_send(vector)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_send$function$
;

CREATE OR REPLACE FUNCTION public.vector_spherical_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_spherical_distance$function$
;

CREATE OR REPLACE FUNCTION public.vector_sub(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_sub$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_float4(vector, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_float4$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_halfvec(vector, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_sparsevec(vector, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.vector_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;

