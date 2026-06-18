interface EmptyStateProps {
  title:   string;
  message: string;
  icon?:   string;
}

export function EmptyState({ title, message, icon = "◎" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <span className="text-4xl opacity-30">{icon}</span>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted max-w-xs leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
