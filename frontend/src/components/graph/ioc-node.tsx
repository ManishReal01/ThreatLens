import { Handle, Position, NodeProps } from '@xyflow/react';
import { Fingerprint, Globe, Link as LinkIcon, Hash } from 'lucide-react';

const typeConfig: Record<string, { icon: React.ElementType, color: string }> = {
  ipv4: { icon: Globe, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  domain: { icon: LinkIcon, color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
  url: { icon: LinkIcon, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  hash: { icon: Hash, color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
  default: { icon: Fingerprint, color: 'text-gray-500 bg-gray-500/10 border-gray-500/20' }
};

const severityConfig: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  unknown: 'bg-muted text-muted-foreground border-border'
};

export function IOCNode({ data }: NodeProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { value, type, severity, isRoot } = data as any;
  const config = typeConfig[type] || typeConfig.default;
  const Icon = config.icon;
  const sevClass = severityConfig[severity] || severityConfig.unknown;

  return (
    <div className={`
      relative min-w-[240px] rounded-xl border shadow-sm
      ${isRoot ? 'ring-2 ring-primary border-primary bg-primary/5' : 'bg-card border-border'}
      text-card-foreground p-3 transition-colors hover:border-primary/50
    `}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 rounded-sm bg-muted-foreground border-none" />
      
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md border ${config.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-semibold truncate" title={value}>
            {value.length > 25 ? value.substring(0, 25) + '...' : value}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
            {type}
          </div>
        </div>
        
        <div className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-medium ${sevClass}`}>
          {severity}
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 rounded-sm bg-muted-foreground border-none" />
    </div>
  );
}
