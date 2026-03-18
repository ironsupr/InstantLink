const ActivityTimeline = ({ activities = [] }) => {
    if (activities.length === 0) return null;

    return (
        <div className="space-y-6 relative before:absolute before:inset-0 before:left-[7px] before:w-[2px] before:bg-gray-100 before:h-full overflow-hidden">
            {activities.map((activity, idx) => (
                <div key={idx} className="flex gap-4 relative z-10">
                    <div className={`mt-1.5 size-4 rounded-full border-4 border-white shadow-sm flex-shrink-0 ${idx === 0 ? 'bg-blue-500' : 'bg-gray-300'
                        }`} />
                    <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium text-gray-900 leading-tight">
                            {activity.text}
                        </p>
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-tight">
                            {activity.timestamp}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ActivityTimeline;
