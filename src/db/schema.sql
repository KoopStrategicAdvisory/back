-- ============================================================
-- BASE DE DATOS KOOP - Gestion de expedientes juridicos (v3 FINAL)
-- PostgreSQL 14+ / PGlite
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. CATALOGOS SIMPLES
-- ------------------------------------------------------------

CREATE TABLE roles (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      TEXT NOT NULL UNIQUE,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    descripcion TEXT
);

CREATE TABLE tipo_proceso (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE subtipo_proceso (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tipo_pretension (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE instancias (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tipo_actuacion (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tipo_documento (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tipo_notificacion (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           TEXT NOT NULL UNIQUE,
    fundamento_legal TEXT,
    dias_surtimiento INTEGER,
    descripcion      TEXT,
    active           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE medio_notificacion (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE estado_proceso (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE estado_etapa (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE estado_tarea (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE prioridad (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    nivel  INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE calidad_usuario (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    calidad TEXT NOT NULL UNIQUE,
    active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE contraparte (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE clientes (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           TEXT NOT NULL,
    tipo_persona     TEXT CHECK (tipo_persona IN ('NATURAL','JURIDICA')),
    tipo_documento   TEXT CHECK (tipo_documento IN ('CC','CE','PA','NIT','TI','PE')),
    numero_documento TEXT,
    email            TEXT,
    telefono         TEXT,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_clientes_documento CHECK ((tipo_documento IS NULL) = (numero_documento IS NULL))
);

CREATE UNIQUE INDEX uq_clientes_documento ON clientes(tipo_documento, numero_documento)
    WHERE tipo_documento IS NOT NULL AND numero_documento IS NOT NULL;

-- ------------------------------------------------------------
-- 2. CATALOGOS RELACIONALES
-- ------------------------------------------------------------

CREATE TABLE tipo_proc_subtipo_proc_tipo_pre (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tipo_proceso    BIGINT NOT NULL REFERENCES tipo_proceso(id),
    id_subtipo_proceso BIGINT NOT NULL REFERENCES subtipo_proceso(id),
    id_tipo_pretension BIGINT NOT NULL REFERENCES tipo_pretension(id),
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension)
);

CREATE TABLE etapas_procesales (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tipo_proceso  BIGINT NOT NULL REFERENCES tipo_proceso(id),
    nombre_etapa     TEXT NOT NULL,
    descripcion      TEXT,
    fundamento_legal TEXT,
    active           BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------
-- 3. SEGURIDAD / USUARIOS
-- ------------------------------------------------------------

CREATE TABLE users (
    id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                     TEXT NOT NULL,
    email                      TEXT NOT NULL UNIQUE,
    password_hash              TEXT NOT NULL,
    email_verification_token   TEXT,
    email_verification_expires TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    v                          INTEGER NOT NULL DEFAULT 0,
    active                     BOOLEAN NOT NULL DEFAULT TRUE,
    tipo_documento             TEXT CHECK (tipo_documento IN ('CC','CE','PA','NIT','TI','PE')),
    numero_documento           TEXT,
    telefono_principal         TEXT,
    telefono_alterno           TEXT,
    direccion_notificacion     TEXT,
    ciudad                     TEXT,
    departamento               TEXT,
    pais                       TEXT,
    tarjeta_profesional        BOOLEAN,
    numero_tarjeta_prof        TEXT,
    fecha_expedicion_tp        DATE,
    especialidades             TEXT,
    cargo                      TEXT,
    id_supervisor              BIGINT REFERENCES users(id),
    fecha_ingreso              DATE,
    fecha_retiro               DATE,
    tarifa_hora                NUMERIC(15,2),
    moneda_tarifa              CHAR(3) DEFAULT 'COP',
    firma_digital_url          TEXT,
    foto_url                   TEXT,
    zona_horaria               TEXT,
    idioma_preferido           TEXT,
    last_login                 TIMESTAMPTZ,
    failed_login_attempts      INTEGER NOT NULL DEFAULT 0,
    locked_until               TIMESTAMPTZ,
    mfa_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret                 TEXT,
    password_reset_token       TEXT,
    password_reset_expires     TIMESTAMPTZ,
    must_change_password       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE user_rol (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_rol     BIGINT NOT NULL REFERENCES roles(id),
    UNIQUE (id_usuario, id_rol)
);

-- ------------------------------------------------------------
-- 4. PLANTILLAS PROCESALES
-- ------------------------------------------------------------

CREATE TABLE iter_procesal_plantilla (
    id                                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tipo_proc_subtipo_proc_tipo_pre BIGINT NOT NULL REFERENCES tipo_proc_subtipo_proc_tipo_pre(id),
    id_etapa                           BIGINT NOT NULL REFERENCES etapas_procesales(id),
    orden                              INTEGER NOT NULL,
    id_instancia                       BIGINT REFERENCES instancias(id),
    plazo_dias                         INTEGER,
    dias_habiles                       BOOLEAN NOT NULL DEFAULT TRUE,
    dispara_notificacion               BOOLEAN NOT NULL DEFAULT FALSE,
    id_tipo_notificacion_esperada      BIGINT REFERENCES tipo_notificacion(id),
    etapa_anterior_id                  BIGINT REFERENCES iter_procesal_plantilla(id),
    es_obligatoria                     BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones                      TEXT,
    active                             BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_tipo_proc_subtipo_proc_tipo_pre, orden)
);

COMMENT ON COLUMN iter_procesal_plantilla.etapa_anterior_id IS
  'Prerrequisito procesal (grafo de precedencia). NULL = etapa inicial.';

CREATE TABLE tareas_plantilla (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_iter_plantilla  BIGINT NOT NULL REFERENCES iter_procesal_plantilla(id),
    titulo             TEXT NOT NULL,
    descripcion        TEXT,
    dias_desde_etapa   INTEGER,
    dias_habiles       BOOLEAN NOT NULL DEFAULT TRUE,
    id_prioridad       BIGINT REFERENCES prioridad(id),
    id_rol_responsable BIGINT REFERENCES roles(id),
    es_hito_critico    BOOLEAN NOT NULL DEFAULT FALSE,
    active             BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------
-- 5. OPERACION DE EXPEDIENTES
-- ------------------------------------------------------------

CREATE TABLE expediente (
    id                                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario                         BIGINT NOT NULL REFERENCES users(id),
    active                             BOOLEAN NOT NULL DEFAULT TRUE,
    numero_de_expediente               TEXT NOT NULL UNIQUE,
    id_cliente                         BIGINT REFERENCES clientes(id),
    id_calidad_usuario                 BIGINT REFERENCES calidad_usuario(id),
    id_tipo_proc_subtipo_proc_tipo_pre BIGINT REFERENCES tipo_proc_subtipo_proc_tipo_pre(id),
    id_contraparte                     BIGINT REFERENCES contraparte(id),
    juzgado_o_autoridad_que_conoce     TEXT,
    id_estado_proceso                  BIGINT REFERENCES estado_proceso(id)
);

CREATE TABLE expediente_etapas (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente          BIGINT NOT NULL REFERENCES expediente(id) ON DELETE CASCADE,
    id_iter_plantilla      BIGINT REFERENCES iter_procesal_plantilla(id),
    id_etapa               BIGINT REFERENCES etapas_procesales(id),
    orden                  INTEGER,
    id_instancia           BIGINT REFERENCES instancias(id),
    id_estado_etapa        BIGINT REFERENCES estado_etapa(id),
    fecha_inicio           DATE,
    fecha_vencimiento      DATE,
    fecha_fin_real         DATE,
    id_usuario_responsable BIGINT REFERENCES users(id),
    observaciones          TEXT,
    origen                 TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    active                 BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_expediente, id_iter_plantilla)
);

CREATE TABLE documentos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente       BIGINT NOT NULL REFERENCES expediente(id) ON DELETE CASCADE,
    id_tipo_documento   BIGINT REFERENCES tipo_documento(id),
    nombre_archivo      TEXT NOT NULL,
    titulo              TEXT,
    descripcion         TEXT,
    url_storage         TEXT,
    mime_type           TEXT,
    tamano_bytes        BIGINT,
    fecha_documento     DATE,
    fecha_carga         TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_usuario_carga    BIGINT REFERENCES users(id),
    id_expediente_etapa BIGINT REFERENCES expediente_etapas(id),
    version             INTEGER NOT NULL DEFAULT 1,
    visibilidad_cliente BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE actuaciones (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente       BIGINT NOT NULL REFERENCES expediente(id) ON DELETE CASCADE,
    id_expediente_etapa BIGINT REFERENCES expediente_etapas(id),
    fecha               DATE NOT NULL,
    id_tipo_actuacion   BIGINT REFERENCES tipo_actuacion(id),
    titulo              TEXT NOT NULL,
    descripcion         TEXT,
    autoridad_emite     TEXT,
    id_usuario_registra BIGINT REFERENCES users(id),
    id_documento        BIGINT REFERENCES documentos(id),
    es_hito             BOOLEAN NOT NULL DEFAULT FALSE,
    url_rama_judicial   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE notificaciones (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente         BIGINT NOT NULL REFERENCES expediente(id) ON DELETE CASCADE,
    id_expediente_etapa   BIGINT REFERENCES expediente_etapas(id),
    id_actuacion          BIGINT REFERENCES actuaciones(id),
    id_tipo_notificacion  BIGINT REFERENCES tipo_notificacion(id),
    id_medio_notificacion BIGINT REFERENCES medio_notificacion(id),
    parte_notificada      TEXT,
    destinatario          TEXT,
    direccion_o_correo    TEXT,
    fecha_realizacion     DATE,
    fecha_surtimiento     DATE,
    dias_plazo            INTEGER,
    fecha_vencimiento     DATE,
    objeto_notificacion   TEXT,
    estado                TEXT,
    constancia_url        TEXT,
    observaciones         TEXT,
    id_usuario_registra   BIGINT REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    active                BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE audiencias (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente          BIGINT NOT NULL REFERENCES expediente(id) ON DELETE CASCADE,
    id_expediente_etapa    BIGINT REFERENCES expediente_etapas(id),
    tipo_audiencia         TEXT,
    fecha_programada       TIMESTAMPTZ,
    modalidad              TEXT,
    enlace_virtual         TEXT,
    juzgado_o_autoridad    TEXT,
    direccion_fisica       TEXT,
    asistentes             TEXT,
    id_usuario_responsable BIGINT REFERENCES users(id),
    estado                 TEXT,
    resultado              TEXT,
    proxima_fecha          TIMESTAMPTZ,
    id_acta_documento      BIGINT REFERENCES documentos(id),
    observaciones          TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    active                 BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tareas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente       BIGINT REFERENCES expediente(id) ON DELETE CASCADE,
    id_expediente_etapa BIGINT REFERENCES expediente_etapas(id),
    id_tarea_plantilla  BIGINT REFERENCES tareas_plantilla(id),
    titulo              TEXT NOT NULL,
    descripcion         TEXT,
    id_usuario_asignado BIGINT REFERENCES users(id),
    id_usuario_creador  BIGINT REFERENCES users(id),
    id_prioridad        BIGINT REFERENCES prioridad(id),
    id_estado_tarea     BIGINT REFERENCES estado_tarea(id),
    origen              TEXT,
    fecha_creacion      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_limite        DATE,
    fecha_completado    TIMESTAMPTZ,
    es_hito_preclusivo  BOOLEAN NOT NULL DEFAULT FALSE,
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------
-- 6. FINANCIERO
-- ------------------------------------------------------------

CREATE TABLE honorarios (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente          BIGINT NOT NULL REFERENCES expediente(id),
    id_usuario             BIGINT REFERENCES users(id),
    modalidad              TEXT,
    descripcion_modalidad  TEXT,
    monto_total_pactado    NUMERIC(15,2),
    moneda                 CHAR(3) DEFAULT 'COP',
    porcentaje_cuota_litis NUMERIC(5,2),
    fecha_pacto            DATE,
    fecha_inicio           DATE,
    fecha_fin              DATE,
    forma_pago             TEXT,
    numero_cuotas          INTEGER,
    valor_cuota            NUMERIC(15,2),
    dia_pago_mes           INTEGER CHECK (dia_pago_mes BETWEEN 1 AND 28),
    incluye_gastos         BOOLEAN NOT NULL DEFAULT FALSE,
    observaciones          TEXT,
    contrato_url           TEXT,
    estado                 TEXT,
    active                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pagos (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente     BIGINT NOT NULL REFERENCES expediente(id),
    id_honorario      BIGINT REFERENCES honorarios(id),
    id_usuario        BIGINT REFERENCES users(id),
    fecha_pago        DATE NOT NULL,
    numero_cuota      INTEGER,
    concepto          TEXT,
    monto             NUMERIC(15,2) NOT NULL,
    moneda            CHAR(3) DEFAULT 'COP',
    metodo_pago       TEXT,
    banco             TEXT,
    numero_referencia TEXT,
    numero_factura    TEXT,
    numero_recibo     TEXT,
    comprobante_url   TEXT,
    pagado_por        TEXT,
    observaciones     TEXT,
    estado            TEXT,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gastos_proceso (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_expediente   BIGINT NOT NULL REFERENCES expediente(id),
    id_usuario      BIGINT REFERENCES users(id),
    fecha_gasto     DATE NOT NULL,
    categoria_gasto TEXT,
    descripcion     TEXT,
    monto           NUMERIC(15,2) NOT NULL,
    moneda          CHAR(3) DEFAULT 'COP',
    proveedor       TEXT,
    nit_proveedor   TEXT,
    numero_factura  TEXT,
    factura_url     TEXT,
    reembolsable    BOOLEAN NOT NULL DEFAULT FALSE,
    reembolsado     BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_reembolso DATE,
    pagado_por      TEXT,
    observaciones   TEXT,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. KANBAN Y COLABORACION
-- ------------------------------------------------------------

CREATE TABLE tablero_kanban (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                 TEXT NOT NULL,
    descripcion            TEXT,
    tipo_granularidad      TEXT,
    tipo_ambito            TEXT,
    id_expediente          BIGINT REFERENCES expediente(id),
    id_usuario_propietario BIGINT NOT NULL REFERENCES users(id),
    es_publico             BOOLEAN NOT NULL DEFAULT FALSE,
    filtros_default        TEXT,
    vista_default          TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    active                 BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tablero_kanban_usuario (
    id_tablero BIGINT NOT NULL REFERENCES tablero_kanban(id) ON DELETE CASCADE,
    id_usuario BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (id_tablero, id_usuario)
);

CREATE TABLE columna_kanban (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tablero       BIGINT NOT NULL REFERENCES tablero_kanban(id) ON DELETE CASCADE,
    nombre           TEXT NOT NULL,
    orden            INTEGER NOT NULL,
    color            TEXT,
    wip_limit        INTEGER,
    es_inicial       BOOLEAN NOT NULL DEFAULT FALSE,
    es_final         BOOLEAN NOT NULL DEFAULT FALSE,
    regla_auto_mover TEXT,
    active           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE columna_kanban_estado (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_columna      BIGINT NOT NULL REFERENCES columna_kanban(id) ON DELETE CASCADE,
    id_estado_tarea BIGINT REFERENCES estado_tarea(id),
    id_estado_etapa BIGINT REFERENCES estado_etapa(id),
    CHECK ((id_estado_tarea IS NOT NULL AND id_estado_etapa IS NULL)
        OR (id_estado_etapa IS NOT NULL AND id_estado_tarea IS NULL)),
    UNIQUE (id_columna, id_estado_tarea),
    UNIQUE (id_columna, id_estado_etapa)
);

CREATE TABLE tarea_kanban_position (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tablero          BIGINT NOT NULL REFERENCES tablero_kanban(id) ON DELETE CASCADE,
    id_columna          BIGINT NOT NULL REFERENCES columna_kanban(id) ON DELETE CASCADE,
    tipo_entidad        TEXT NOT NULL CHECK (tipo_entidad IN ('TAREA','ETAPA')),
    id_tarea            BIGINT REFERENCES tareas(id) ON DELETE CASCADE,
    id_expediente_etapa BIGINT REFERENCES expediente_etapas(id) ON DELETE CASCADE,
    orden_vertical      INTEGER,
    fecha_movimiento    TIMESTAMPTZ,
    id_usuario_movio    BIGINT REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK ((tipo_entidad = 'TAREA' AND id_tarea IS NOT NULL AND id_expediente_etapa IS NULL)
        OR (tipo_entidad = 'ETAPA' AND id_expediente_etapa IS NOT NULL AND id_tarea IS NULL))
);

CREATE UNIQUE INDEX uq_kanban_pos_tarea ON tarea_kanban_position(id_tablero, id_tarea)
    WHERE id_tarea IS NOT NULL;
CREATE UNIQUE INDEX uq_kanban_pos_etapa ON tarea_kanban_position(id_tablero, id_expediente_etapa)
    WHERE id_expediente_etapa IS NOT NULL;

CREATE TABLE etiqueta (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre             TEXT NOT NULL,
    color              TEXT,
    icono              TEXT,
    id_usuario_creador BIGINT REFERENCES users(id),
    descripcion        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    active             BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tarea_etiqueta (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_entidad        TEXT NOT NULL CHECK (tipo_entidad IN ('TAREA','ETAPA')),
    id_tarea            BIGINT REFERENCES tareas(id) ON DELETE CASCADE,
    id_expediente_etapa BIGINT REFERENCES expediente_etapas(id) ON DELETE CASCADE,
    id_etiqueta         BIGINT NOT NULL REFERENCES etiqueta(id) ON DELETE CASCADE,
    id_usuario_agrego   BIGINT REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK ((tipo_entidad = 'TAREA' AND id_tarea IS NOT NULL AND id_expediente_etapa IS NULL)
        OR (tipo_entidad = 'ETAPA' AND id_expediente_etapa IS NOT NULL AND id_tarea IS NULL))
);

CREATE TABLE comentario_tarea (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_entidad        TEXT NOT NULL CHECK (tipo_entidad IN ('TAREA','ETAPA')),
    id_tarea            BIGINT REFERENCES tareas(id) ON DELETE CASCADE,
    id_expediente_etapa BIGINT REFERENCES expediente_etapas(id) ON DELETE CASCADE,
    id_usuario_autor    BIGINT NOT NULL REFERENCES users(id),
    contenido           TEXT NOT NULL,
    id_comentario_padre BIGINT REFERENCES comentario_tarea(id),
    editado             BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_edicion       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK ((tipo_entidad = 'TAREA' AND id_tarea IS NOT NULL AND id_expediente_etapa IS NULL)
        OR (tipo_entidad = 'ETAPA' AND id_expediente_etapa IS NOT NULL AND id_tarea IS NULL))
);

CREATE TABLE comentario_mencion (
    id_comentario BIGINT NOT NULL REFERENCES comentario_tarea(id) ON DELETE CASCADE,
    id_usuario    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (id_comentario, id_usuario)
);

CREATE TABLE checklist_tarea (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tarea            BIGINT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
    titulo              TEXT NOT NULL,
    orden               INTEGER,
    completado          BOOLEAN NOT NULL DEFAULT FALSE,
    id_usuario_completo BIGINT REFERENCES users(id),
    fecha_completado    TIMESTAMPTZ,
    id_usuario_asignado BIGINT REFERENCES users(id),
    fecha_limite        DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE adjunto_tarea (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_entidad        TEXT NOT NULL CONSTRAINT chk_adjunto_tipo
                            CHECK (tipo_entidad IN ('TAREA','ETAPA','COMENTARIO')),
    id_tarea            BIGINT REFERENCES tareas(id) ON DELETE CASCADE,
    id_expediente_etapa BIGINT REFERENCES expediente_etapas(id) ON DELETE CASCADE,
    id_comentario       BIGINT REFERENCES comentario_tarea(id) ON DELETE CASCADE,
    nombre_archivo      TEXT NOT NULL,
    url_archivo         TEXT,
    mime_type           TEXT,
    tamanio_bytes       BIGINT,
    id_usuario_subio    BIGINT REFERENCES users(id),
    id_documento_formal BIGINT REFERENCES documentos(id),
    es_privado          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_adjunto_exclusivo CHECK (
         (tipo_entidad = 'TAREA'      AND id_tarea IS NOT NULL AND id_expediente_etapa IS NULL AND id_comentario IS NULL)
      OR (tipo_entidad = 'ETAPA'      AND id_expediente_etapa IS NOT NULL AND id_tarea IS NULL AND id_comentario IS NULL)
      OR (tipo_entidad = 'COMENTARIO' AND id_comentario IS NOT NULL AND id_tarea IS NULL AND id_expediente_etapa IS NULL)
    )
);

CREATE TABLE tarea_dependencia (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tarea_origen    BIGINT REFERENCES tareas(id) ON DELETE CASCADE,
    id_etapa_origen    BIGINT REFERENCES expediente_etapas(id) ON DELETE CASCADE,
    id_tarea_destino   BIGINT REFERENCES tareas(id) ON DELETE CASCADE,
    id_etapa_destino   BIGINT REFERENCES expediente_etapas(id) ON DELETE CASCADE,
    tipo_dependencia   TEXT CHECK (tipo_dependencia IN ('FS','SS','FF','SF')),
    dias_lag           INTEGER DEFAULT 0,
    es_bloqueante      BOOLEAN NOT NULL DEFAULT FALSE,
    id_usuario_creador BIGINT REFERENCES users(id),
    observaciones      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK ((id_tarea_origen  IS NOT NULL)::int + (id_etapa_origen  IS NOT NULL)::int = 1),
    CHECK ((id_tarea_destino IS NOT NULL)::int + (id_etapa_destino IS NOT NULL)::int = 1),
    CONSTRAINT chk_dep_no_auto CHECK (
        (id_tarea_origen IS NULL OR id_tarea_destino IS NULL OR id_tarea_origen <> id_tarea_destino)
        AND
        (id_etapa_origen IS NULL OR id_etapa_destino IS NULL OR id_etapa_origen <> id_etapa_destino)
    )
);

-- ------------------------------------------------------------
-- 8. AUDITORIA
-- ------------------------------------------------------------

CREATE TABLE auditoria (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabla         TEXT NOT NULL,
    operacion     TEXT NOT NULL CHECK (operacion IN ('INSERT','UPDATE','DELETE')),
    id_registro   BIGINT NOT NULL,
    id_usuario    BIGINT REFERENCES users(id),
    datos_antes   JSONB,
    datos_despues JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fn_auditoria() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria(tabla, operacion, id_registro, id_usuario, datos_antes, datos_despues)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id,
            NULLIF(current_setting('app.user_id', TRUE), '')::BIGINT, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO auditoria(tabla, operacion, id_registro, id_usuario, datos_antes, datos_despues)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id,
            NULLIF(current_setting('app.user_id', TRUE), '')::BIGINT, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO auditoria(tabla, operacion, id_registro, id_usuario, datos_antes, datos_despues)
    VALUES (TG_TABLE_NAME, TG_OP, OLD.id,
            NULLIF(current_setting('app.user_id', TRUE), '')::BIGINT, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_aud_expediente
  AFTER INSERT OR UPDATE OR DELETE ON expediente
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

CREATE TRIGGER trg_aud_expediente_etapas
  AFTER INSERT OR UPDATE OR DELETE ON expediente_etapas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

CREATE TRIGGER trg_aud_actuaciones
  AFTER INSERT OR UPDATE OR DELETE ON actuaciones
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

CREATE TRIGGER trg_aud_notificaciones
  AFTER INSERT OR UPDATE OR DELETE ON notificaciones
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

CREATE TRIGGER trg_aud_honorarios
  AFTER INSERT OR UPDATE OR DELETE ON honorarios
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

CREATE TRIGGER trg_aud_pagos
  AFTER INSERT OR UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

CREATE TRIGGER trg_aud_tareas
  AFTER INSERT OR UPDATE OR DELETE ON tareas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- ------------------------------------------------------------
-- 9. INDICES
-- ------------------------------------------------------------

CREATE INDEX idx_expediente_usuario        ON expediente(id_usuario);
CREATE INDEX idx_expediente_cliente        ON expediente(id_cliente);
CREATE INDEX idx_exp_etapas_expediente     ON expediente_etapas(id_expediente);
CREATE INDEX idx_tareas_expediente         ON tareas(id_expediente);
CREATE INDEX idx_tareas_asignado           ON tareas(id_usuario_asignado);
CREATE INDEX idx_actuaciones_expediente    ON actuaciones(id_expediente);
CREATE INDEX idx_notificaciones_expediente ON notificaciones(id_expediente);
CREATE INDEX idx_documentos_expediente     ON documentos(id_expediente);
CREATE INDEX idx_audiencias_expediente     ON audiencias(id_expediente);
CREATE INDEX idx_pagos_honorario           ON pagos(id_honorario);
CREATE INDEX idx_iter_plantilla_combo      ON iter_procesal_plantilla(id_tipo_proc_subtipo_proc_tipo_pre);
CREATE INDEX idx_kanban_pos_columna        ON tarea_kanban_position(id_columna);
CREATE INDEX idx_columna_kanban_tablero    ON columna_kanban(id_tablero);

CREATE INDEX idx_dep_tarea_origen  ON tarea_dependencia(id_tarea_origen)  WHERE id_tarea_origen  IS NOT NULL;
CREATE INDEX idx_dep_etapa_origen  ON tarea_dependencia(id_etapa_origen)  WHERE id_etapa_origen  IS NOT NULL;
CREATE INDEX idx_dep_tarea_destino ON tarea_dependencia(id_tarea_destino) WHERE id_tarea_destino IS NOT NULL;
CREATE INDEX idx_dep_etapa_destino ON tarea_dependencia(id_etapa_destino) WHERE id_etapa_destino IS NOT NULL;

CREATE INDEX idx_tareas_estado     ON tareas(id_estado_tarea);
CREATE INDEX idx_exp_etapas_estado ON expediente_etapas(id_expediente, id_estado_etapa);
CREATE INDEX idx_expediente_estado ON expediente(id_estado_proceso);

CREATE INDEX idx_notificaciones_vcto ON notificaciones(fecha_vencimiento) WHERE active = TRUE;
CREATE INDEX idx_tareas_fecha_limite ON tareas(fecha_limite)              WHERE active = TRUE;
CREATE INDEX idx_audiencias_fecha    ON audiencias(fecha_programada)      WHERE active = TRUE;

CREATE INDEX idx_pagos_fecha              ON pagos(fecha_pago);
CREATE INDEX idx_gastos_fecha             ON gastos_proceso(fecha_gasto);
CREATE INDEX idx_auditoria_tabla_registro ON auditoria(tabla, id_registro);
CREATE INDEX idx_auditoria_fecha          ON auditoria(created_at);
CREATE INDEX idx_auditoria_usuario        ON auditoria(id_usuario);

COMMIT;
