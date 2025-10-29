/**
 * Date Utility Functions
 * Provides consistent date formatting throughout the app
 */

export const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export const formatDateTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

export const formatTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateString;
  }
};

export const formatRelativeTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    } else {
      return formatDate(dateString);
    }
  } catch {
    return dateString;
  }
};

export const getRemainingTime = (endDateString: string): string => {
  try {
    const endDate = new Date(endDateString);
    const now = new Date();
    const diffInSeconds = Math.floor((endDate.getTime() - now.getTime()) / 1000);

    if (diffInSeconds <= 0) {
      return 'Ended';
    } else if (diffInSeconds < 60) {
      return `${diffInSeconds}s remaining`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.ceil(diffInSeconds / 60);
      return `${minutes}m remaining`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.ceil(diffInSeconds / 3600);
      return `${hours}h remaining`;
    } else {
      const days = Math.ceil(diffInSeconds / 86400);
      return `${days}d remaining`;
    }
  } catch {
    return 'Invalid date';
  }
};
