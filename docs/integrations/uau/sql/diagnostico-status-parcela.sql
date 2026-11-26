-- Executar no banco SQL Server do UAU. Apenas leitura de metadados.
-- Nao pressupoe schema dbo nem significado para os codigos.
SET NOCOUNT ON;

-- 1. Coluna, tipo, nulabilidade, default e descricao cadastrada no banco.
SELECT S.name AS Esquema, T.name AS Tabela, C.name AS Coluna,
    TY.name AS TipoSQL, C.max_length AS TamanhoBytes,
    C.is_nullable AS AceitaNulo, DC.definition AS ValorPadrao,
    EP.name AS NomePropriedade, CAST(EP.value AS nvarchar(4000)) AS DescricaoNoBanco
FROM sys.tables AS T
INNER JOIN sys.schemas AS S ON S.schema_id = T.schema_id
INNER JOIN sys.columns AS C ON C.object_id = T.object_id
INNER JOIN sys.types AS TY ON TY.user_type_id = C.user_type_id
LEFT JOIN sys.default_constraints AS DC ON DC.object_id = C.default_object_id
LEFT JOIN sys.extended_properties AS EP
    ON EP.class = 1 AND EP.major_id = T.object_id AND EP.minor_id = C.column_id
WHERE T.name = 'ContasReceber' AND C.name = 'Status_Prc'
ORDER BY S.name, EP.name;

-- 2. FK que inclui Status_Prc: exibir TODAS as colunas da mesma FK composta.
SELECT FK.name AS ChaveEstrangeira,
    PS.name AS EsquemaOrigem, PT.name AS TabelaOrigem, PC.name AS ColunaOrigem,
    RS.name AS EsquemaDestino, RT.name AS TabelaDestino, RC.name AS ColunaDestino,
    FKC.constraint_column_id AS OrdemNaChave,
    FK.is_disabled AS Desabilitada, FK.is_not_trusted AS NaoValidada
FROM sys.foreign_keys AS FK
INNER JOIN sys.foreign_key_columns AS FKC ON FKC.constraint_object_id = FK.object_id
INNER JOIN sys.tables AS PT ON PT.object_id = FK.parent_object_id
INNER JOIN sys.schemas AS PS ON PS.schema_id = PT.schema_id
INNER JOIN sys.columns AS PC ON PC.object_id = PT.object_id AND PC.column_id = FKC.parent_column_id
INNER JOIN sys.tables AS RT ON RT.object_id = FK.referenced_object_id
INNER JOIN sys.schemas AS RS ON RS.schema_id = RT.schema_id
INNER JOIN sys.columns AS RC ON RC.object_id = RT.object_id AND RC.column_id = FKC.referenced_column_id
WHERE EXISTS (
    SELECT 1 FROM sys.foreign_key_columns AS X
    INNER JOIN sys.columns AS XC ON XC.object_id = X.parent_object_id AND XC.column_id = X.parent_column_id
    INNER JOIN sys.tables AS XT ON XT.object_id = X.parent_object_id
    WHERE X.constraint_object_id = FK.object_id
      AND XT.name = 'ContasReceber' AND XC.name = 'Status_Prc'
)
ORDER BY PS.name, FK.name, FKC.constraint_column_id;

-- 3. CHECKs da tabela: podem limitar os valores sem haver tabela de legenda.
SELECT S.name AS Esquema, T.name AS Tabela, CC.name AS Restricao,
    CC.definition AS Regra, CC.is_disabled AS Desabilitada,
    CC.is_not_trusted AS NaoValidada
FROM sys.check_constraints AS CC
INNER JOIN sys.tables AS T ON T.object_id = CC.parent_object_id
INNER JOIN sys.schemas AS S ON S.schema_id = T.schema_id
WHERE T.name = 'ContasReceber'
ORDER BY S.name, CC.name;

-- 4. Indices que contem Status_Prc: indicam estrutura, NAO legenda dos codigos.
SELECT S.name AS Esquema, T.name AS Tabela, I.name AS Indice,
    I.is_primary_key AS ChavePrimaria, I.is_unique AS Unico,
    IC.is_included_column AS ColunaIncluida, IC.key_ordinal AS OrdemNaChave
FROM sys.tables AS T
INNER JOIN sys.schemas AS S ON S.schema_id = T.schema_id
INNER JOIN sys.columns AS C ON C.object_id = T.object_id
INNER JOIN sys.index_columns AS IC ON IC.object_id = T.object_id AND IC.column_id = C.column_id
INNER JOIN sys.indexes AS I ON I.object_id = IC.object_id AND I.index_id = IC.index_id
WHERE T.name = 'ContasReceber' AND C.name = 'Status_Prc'
ORDER BY S.name, I.name;

-- Resultados vazios nao provam ausencia: a visibilidade de metadados depende das permissoes.
-- Default/PK/indice nao explicam o significado comercial de 0.
-- Sem FK/CHECK/descricao util, validar em documentacao/dicionario/suporte do UAU.
-- Nao confundir Status_Prc com StatusCbr_Prc, EmBanco_Prc ou StatusAprov_vdd.
