import { Folder, MoreVertical } from "lucide-react";

const FolderCard = ({ name, itemCount, lastUpdated, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="group bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 relative"
        >
            <div className="flex justify-between items-start">
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                    <Folder className="size-6 fill-current" />
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); /* options logic */ }}
                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                >
                    <MoreVertical className="size-4" />
                </button>
            </div>

            <div>
                <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
                <p className="text-xs text-gray-500 mt-1">
                    {itemCount} items • Updated {lastUpdated}
                </p>
            </div>
        </div>
    );
};

export default FolderCard;
