import React, {useEffect} from 'react';
import useAppStore from "../stores/AppStore";

const Notification: React.FC = () => {
  const notification = useAppStore(state => state.notification);
  const hideNotification = useAppStore(state => state.hideNotification);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (notification.isVisible) {
      timeoutId = setTimeout(() => {
        hideNotification();
      }, notification.duration);
    }

    return () => {
      if (timeoutId)
        clearTimeout(timeoutId);
    };
  }, [notification.isVisible, notification.duration, hideNotification]);

  if (!notification.isVisible)
    return null;

  return (
    <div className="fixed top-4 right-4 bg-gray-800 bg-opacity-80 text-white px-4 py-3 rounded-md shadow-lg z-50 transform transition-all duration-300 ease-in-out">
      {notification.message}
    </div>
  )
}

export default Notification;