import React from 'react';
import useAppStore from "../stores/AppStore";


const StatusBar: React.FC = () =>  {
  const pollingStatus = useAppStore(state => state.polling.status);
  const pollingInterval = useAppStore(state => state.polling.interval);
  const lastUpdateTime = useAppStore(state => state.polling.lastUpdateTime);

  const getStatusClass = () => {
    if (pollingStatus === 'started')
      return 'bg-green-500';
    if (pollingStatus === 'error')
      return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (pollingStatus === 'started')
      return `Realtime update: Activated (${pollingInterval / 1000}s interval)`;
    if (pollingStatus === 'error')
      return 'Realtime update: Error';
    return 'Realtime update: Inactivated';
  };

  return (
    <div className="flex justify-between items-center px-6 py-3 bg-gray-100 border-t border-gray-200">
      <div className="flex items-center">
        <span className={`inline-block w-3 h-3 rounded-full ${getStatusClass()} mr-2`}></span>
        <span className="text-gray-700">{getStatusText()}</span>
      </div>
      <div className="text-gray-700">
        Last update: {lastUpdateTime}
      </div>
    </div>
  );
};

export default StatusBar;