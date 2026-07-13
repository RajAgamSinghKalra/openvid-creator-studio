import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";

export default function DropImage() {
    const t = useTranslations("dropImage");

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-4 text-white mask-[radial-gradient(circle,black_70%,transparent_99%)]">
                <Icon icon="hugeicons:image-upload" width="120" />
                <div className="text-3xl font-extrabold uppercase tracking-wider">
                    {t("title")}
                </div>
            </div>
        </div>
    );
}
