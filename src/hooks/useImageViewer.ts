/**
 * Shared image viewer state for list/detail screens.
 */

import { useCallback, useState } from 'react';

export function useImageViewer() {
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerImages, setImageViewerImages] = useState<string[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);

  const handleImagePress = useCallback((images: string[], index = 0) => {
    setImageViewerImages(images);
    setImageViewerIndex(index);
    setImageViewerVisible(true);
  }, []);

  const closeImageViewer = useCallback(() => setImageViewerVisible(false), []);

  return {
    imageViewerVisible,
    imageViewerImages,
    imageViewerIndex,
    handleImagePress,
    closeImageViewer,
  };
}
