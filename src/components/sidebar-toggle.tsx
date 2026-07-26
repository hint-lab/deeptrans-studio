import { Button } from '@/components/ui/button';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';

interface SidebarToggleProps {
    isOpen: boolean;
    onToggle: () => void;
    controlsId?: string;
}

export function SidebarToggle({ isOpen, onToggle, controlsId }: SidebarToggleProps) {
    const handleClick = () => {
        onToggle();
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleClick}
            className="h-8 w-8 p-0 hover:bg-accent"
            aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-controls={controlsId}
            aria-expanded={controlsId ? isOpen : undefined}
        >
            {isOpen ? (
                <PanelLeftClose size="16" className="text-foreground" />
            ) : (
                <PanelLeftOpen size="16" className="text-foreground" />
            )}
        </Button>
    );
}
