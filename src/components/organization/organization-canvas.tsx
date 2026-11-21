'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Building2,
  GripVertical,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  organizationLayout,
  roleLabel,
  teamUsers,
  type Department,
  type DraggedUser,
  type OrganizationData,
  type OrganizationUser,
  type Team,
} from './organization-model';

interface CanvasProps {
  data: OrganizationData;
  companyName: string;
  busy: boolean;
  onEditDepartment: (department: Department) => void;
  onEditTeam: (team: Team) => void;
  onCreateTeam: (departmentId: string) => void;
  onLinkUser: (user: DraggedUser, teamId?: string) => void;
  onRemoveUser: (userId: string, teamId: string) => void;
}
type StructureNode = Node<
  { kind: 'company' | 'department' | 'team'; entityId: string; label: string },
  'structure'
>;
const Context = createContext<CanvasProps | null>(null);
function useOrganization() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing organization context');
  return context;
}

function UserCard({
  user,
  sourceTeamId = null,
}: {
  user: OrganizationUser;
  sourceTeamId?: string | null;
}) {
  const { busy, onLinkUser, onRemoveUser } = useOrganization();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${sourceTeamId ?? 'people'}:${user.user_id}`,
    data: { userId: user.user_id, sourceTeamId } satisfies DraggedUser,
    disabled: busy || user.role === 'viewer',
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'nodrag nopan bg-background border-border flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2',
        isDragging && 'opacity-30'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        disabled={busy || user.role === 'viewer'}
        aria-label={`Arrastar ${user.full_name || 'usuário'} para uma equipe`}
        className="text-muted-foreground cursor-grab touch-none rounded p-0.5 active:cursor-grabbing disabled:cursor-default"
        onPointerDown={(event) => {
          event.stopPropagation();
          listeners?.onPointerDown?.(event);
        }}
      >
        <GripVertical className="size-3.5" />
      </button>
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          user.role === 'supervisor'
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {(user.full_name || '?').slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={user.full_name}>
          {user.full_name || 'Sem nome'}
        </p>
        <p className="text-muted-foreground text-[10px]">
          {roleLabel(user.role)}
        </p>
      </div>
      {user.role !== 'viewer' && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Opções de ${user.full_name || 'usuário'}`}
            className="text-muted-foreground hover:bg-muted rounded p-1"
            disabled={busy}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onLinkUser({ userId: user.user_id, sourceTeamId })}
            >
              {sourceTeamId
                ? 'Mover ou vincular a outra equipe'
                : 'Adicionar a uma equipe'}
            </DropdownMenuItem>
            {sourceTeamId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onRemoveUser(user.user_id, sourceTeamId)}
                  className="text-destructive"
                >
                  Remover desta equipe
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function StructureCard({ data }: NodeProps<StructureNode>) {
  const context = useOrganization();
  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${data.entityId}`,
    data: { teamId: data.entityId },
    disabled: data.kind !== 'team' || context.busy,
  });
  if (data.kind === 'team') {
    const team = context.data.teams.find((team) => team.id === data.entityId)!;
    const users = teamUsers(context.data, team.id);
    const supervisors = users.filter(
      (user) => user.role === 'supervisor'
    ).length;
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'bg-card border-border w-[300px] rounded-xl border shadow-sm transition-shadow',
          isOver && 'ring-primary bg-primary/5 ring-2'
        )}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-primary !border-background !size-2"
        />
        <div className="organization-node-handle border-border flex cursor-grab items-center gap-2 border-b px-4 py-3 active:cursor-grabbing">
          <span className="bg-primary/10 text-primary rounded-lg p-1.5">
            <UsersRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={team.name}>
              {team.name}
            </p>
            <p className="text-muted-foreground text-[10px]">
              {users.length} integrantes · {supervisors} supervisores
            </p>
          </div>
          <button
            type="button"
            aria-label={`Editar equipe ${team.name}`}
            className="nodrag nopan text-muted-foreground hover:bg-muted rounded p-1.5"
            onClick={() => context.onEditTeam(team)}
            disabled={context.busy}
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
        <div className="space-y-2 p-3">
          {users.map((user) => (
            <UserCard key={user.user_id} user={user} sourceTeamId={team.id} />
          ))}
          {!users.length && (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-5 text-center text-xs">
              Arraste pessoas para esta equipe
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              context.onLinkUser({ userId: '', sourceTeamId: null }, team.id)
            }
            disabled={context.busy}
            className="nodrag nopan text-primary hover:bg-primary/5 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium"
          >
            <Plus className="size-3" />
            Adicionar integrante
          </button>
        </div>
      </div>
    );
  }
  const department = context.data.departments.find(
    (department) => department.id === data.entityId
  );
  return (
    <div
      className={cn(
        'organization-node-handle border-border w-[300px] cursor-grab rounded-xl border px-4 py-3 shadow-sm active:cursor-grabbing',
        data.kind === 'company'
          ? 'bg-primary text-primary-foreground'
          : 'bg-card'
      )}
    >
      {data.kind !== 'company' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-primary !border-background !size-2"
        />
      )}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'rounded-lg p-2',
            data.kind === 'company'
              ? 'bg-white/15'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={data.label}>
            {data.label}
          </p>
          <p
            className={cn(
              'text-[10px]',
              data.kind === 'company' ? 'opacity-75' : 'text-muted-foreground'
            )}
          >
            {data.kind === 'company'
              ? 'Empresa · Administração'
              : 'Departamento'}
          </p>
        </div>
        {department && (
          <div className="nodrag nopan flex">
            <button
              aria-label={`Criar equipe em ${department.name}`}
              onClick={() => context.onCreateTeam(department.id)}
              disabled={context.busy}
              className="text-muted-foreground hover:bg-muted rounded p-1.5"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              aria-label={`Editar departamento ${department.name}`}
              onClick={() => context.onEditDepartment(department)}
              disabled={context.busy}
              className="text-muted-foreground hover:bg-muted rounded p-1.5"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {data.kind === 'company' && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-white/15 pt-2 text-[10px]">
          <ShieldCheck className="size-3" />
          {
            context.data.users.filter(
              (user) => user.role === 'admin' || user.role === 'owner'
            ).length
          }{' '}
          administradores
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !border-background !size-2"
      />
    </div>
  );
}
const nodeTypes = { structure: StructureCard };

function CanvasView() {
  const { data, companyName } = useOrganization();
  const flow = useReactFlow<StructureNode>();
  const graph = useMemo(() => {
    const positions = organizationLayout(data);
    const nodes: StructureNode[] = [
      {
        id: 'company',
        type: 'structure',
        data: { kind: 'company', entityId: 'company', label: companyName },
        position: positions.company,
        dragHandle: '.organization-node-handle',
      },
    ];
    const edges: Edge[] = [];
    for (const department of data.departments) {
      const id = `department:${department.id}`;
      nodes.push({
        id,
        type: 'structure',
        data: {
          kind: 'department',
          entityId: department.id,
          label: department.name,
        },
        position: positions[id],
        dragHandle: '.organization-node-handle',
      });
      edges.push({
        id: `company-${id}`,
        source: 'company',
        target: id,
        type: 'smoothstep',
      });
    }
    for (const team of data.teams) {
      const id = `team:${team.id}`;
      nodes.push({
        id,
        type: 'structure',
        data: { kind: 'team', entityId: team.id, label: team.name },
        position: positions[id] ?? { x: 0, y: 320 },
        dragHandle: '.organization-node-handle',
      });
      edges.push({
        id: `department-${id}`,
        source: `department:${team.department_id}`,
        target: id,
        type: 'smoothstep',
      });
    }
    return {
      nodes,
      edges: edges.map((edge) => ({
        ...edge,
        style: { stroke: 'var(--primary)', strokeWidth: 1.5, opacity: 0.35 },
      })),
    };
  }, [data, companyName]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StructureNode>(
    graph.nodes
  );
  useEffect(() => {
    // Synchronize changed memberships/names while retaining the administrator's layout.
    setNodes((previous) =>
      graph.nodes.map((node) => ({
        ...node,
        position:
          previous.find((old) => old.id === node.id)?.position ?? node.position,
      }))
    );
  }, [graph, setNodes]);

  return (
    <div className="border-border bg-background relative h-[560px] min-w-0 overflow-hidden rounded-xl border xl:h-[calc(100vh-17rem)] xl:min-h-[560px]">
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setNodes(graph.nodes);
            requestAnimationFrame(
              () => void flow.fitView({ padding: 0.18, duration: 200 })
            );
          }}
        >
          <Maximize2 className="size-3.5" />
          Organizar visualização
        </Button>
      </div>
      <ReactFlow<StructureNode>
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="[&_.react-flow__controls-button]:!border-border [&_.react-flow__controls-button]:!bg-card [&_.react-flow__controls-button]:!fill-foreground"
        aria-label="Estrutura da empresa por departamento e equipe"
      >
        <Background color="var(--border)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {!data.departments.length && (
        <div className="bg-card/95 border-border absolute right-5 bottom-5 left-5 rounded-xl border p-4 text-sm shadow-sm">
          <p className="font-medium">Comece pelo primeiro departamento</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Crie um departamento, adicione as equipes e depois distribua as
            pessoas. Os administradores já aparecem no topo.
          </p>
        </div>
      )}
    </div>
  );
}

export function OrganizationCanvas(props: CanvasProps) {
  const [query, setQuery] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [active, setActive] = useState<OrganizationUser | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } })
  );
  const visibleUsers = props.data.users.filter(
    (user) =>
      user.full_name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (!onlyUnassigned ||
        !props.data.memberships.some((link) => link.user_id === user.user_id))
  );
  function drop(event: DragEndEvent) {
    setActive(null);
    const source = event.active.data.current as DraggedUser | undefined;
    const target = event.over?.data.current?.teamId as string | undefined;
    if (source && target && source.sourceTeamId !== target)
      props.onLinkUser(source, target);
  }
  return (
    <Context.Provider value={props}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(event) =>
          setActive(
            props.data.users.find(
              (user) => user.user_id === event.active.data.current?.userId
            ) ?? null
          )
        }
        onDragCancel={() => setActive(null)}
        onDragEnd={drop}
      >
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <ReactFlowProvider>
            <CanvasView />
          </ReactFlowProvider>
          <aside
            className="border-border bg-card min-w-0 rounded-xl border"
            aria-label="Pessoas da empresa"
          >
            <div className="border-border space-y-3 border-b p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Pessoas</h2>
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                  {props.data.users.length}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                Arraste para uma equipe ou use o menu de cada pessoa.
              </p>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
                <Input
                  aria-label="Buscar pessoas"
                  placeholder="Buscar pelo nome"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={onlyUnassigned}
                  onChange={(event) => setOnlyUnassigned(event.target.checked)}
                />
                Somente sem equipe
              </label>
            </div>
            <div className="max-h-[440px] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-30rem)] xl:min-h-48">
              {visibleUsers.map((user) => (
                <UserCard key={user.user_id} user={user} />
              ))}
              {!visibleUsers.length && (
                <p className="text-muted-foreground py-6 text-center text-xs">
                  Nenhuma pessoa encontrada.
                </p>
              )}
            </div>
            <p className="text-muted-foreground border-border border-t p-3 text-[11px]">
              O perfil define as permissões. A equipe define em quais
              atendimentos a pessoa atua.
            </p>
          </aside>
        </div>
        <DragOverlay dropAnimation={null}>
          {active && (
            <div className="bg-card border-primary flex w-60 items-center gap-2 rounded-lg border p-3 shadow-xl">
              <UsersRound className="text-primary size-4" />
              <span className="truncate text-sm font-medium">
                {active.full_name}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </Context.Provider>
  );
}
