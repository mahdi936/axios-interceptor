import axios from 'axios';

import { setTokenInfo } from '../../utils/jwt';
const baseUrl = process.env.MEDIAFI_BASE_URL;

export const INSTANCE = axios.create();

export const readAuthTokenFromLocalStorage = () => {
  try {
    const authData = window.localStorage.getItem('auth-data');
    const accessToken = JSON.parse(authData);
    return { accessToken: accessToken.token, refreshToken: accessToken['refresh-token'] };
  } catch (e) {
    return null;
  }
};
export const readAuthEmailFromLocalStorage = () => JSON.parse(localStorage.getItem('admin')).email.trim();
export const writeAuthTokenToLocalStorage = (token) => {
  localStorage.setItem('token', token.refreshToken);
};

// Assume you have a function to refresh the token, e.g., refreshToken()
export const refreshToken = async () => {
  // Implement your logic to refresh the token and update the axios instance
  // with the new token
  const payload = {
    refreshToken: readAuthTokenFromLocalStorage()?.refreshToken,
    token: readAuthTokenFromLocalStorage()?.accessToken,
  };

  let res = await axios.post(`${baseUrl}/Authentication/Refresh-Token`, payload);
  // Set your token info in localstorage or redux or etc...
  setTokenInfo(res?.data);

  INSTANCE.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
  return res.data.token;
};

// Axios request interceptor
INSTANCE.interceptors.request.use(
  (config) => {
    // Check if the request has a token, if not, add the token
    if (!config.headers.Authorization) {
      // Add your logic to get the current token
      const token = readAuthTokenFromLocalStorage().accessToken;
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Axios response interceptor
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

INSTANCE.interceptors.response.use(
  (response) => {
    // If the request was successful, return the response
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If the error status is 401 and it's not already refreshing the token
    if (error.response.status === 401 && !isRefreshing) {
      try {
        isRefreshing = true;
        const newToken = await refreshToken();
        isRefreshing = false;
        originalRequest.headers.Authorization = 'Bearer ' + newToken;

        return INSTANCE(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      } finally {
        processQueue(null, readAuthTokenFromLocalStorage().accessToken);
      }
    }

    // If the error status is 401 and the token refresh is in progress
    if (error.response.status === 401 && isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = 'Bearer ' + token;
          return INSTANCE(originalRequest);
        })
        .catch((err) => {
          return Promise.reject(err);
        });
    }

    // For other errors, return the error
    return Promise.reject(error);
  }
);

export { INSTANCE as HTTPS };
