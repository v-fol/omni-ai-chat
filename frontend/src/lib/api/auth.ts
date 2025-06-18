const API_BASE_URL = 'http://localhost:8000';

export const getAuthStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/status`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch (error) {
    console.error('Failed to get auth status:', error);
    return null;
  }
};

export const logout = async () => {
  await fetch(`${API_BASE_URL}/logout`, {
    credentials: 'include',
  });
}; 