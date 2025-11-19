
import Image from "next/image"

interface ParallelEditorTabProps {
    icon: string;
    filename: string;
    onClick?: () => void;
}

export const ParallelEditorTab: React.FC<ParallelEditorTabProps> = ({ icon, filename, onClick }) => {
    return (
        <div
            className="px-1 flex items-center text-sm cursor-pointer"
            onClick={onClick}
        >
            <Image src={icon} alt={filename} height={18} width={18} />
            <p className="text-foreground dark:text-foreground-dark">{filename}</p>

        </div>

    );
}