import Image from 'next/image';

interface ParallelEditorTabProps {
    icon: string;
    filename: string;
    onClick?: () => void;
}

export const ParallelEditorTab: React.FC<ParallelEditorTabProps> = ({
    icon,
    filename,
    onClick,
}) => {
    return (
        <div className="flex cursor-pointer items-center px-1 text-sm" onClick={onClick}>
            <Image src={icon} alt={filename} height={18} width={18} />
            <p className="dark:text-foreground-dark text-foreground">{filename}</p>
        </div>
    );
};
