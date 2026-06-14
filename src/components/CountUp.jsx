import React, { useState, useEffect, useRef } from 'react';

const CountUp = ({ endValue, prefix = '', suffix = '', duration = 2000, decimals = 0 }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let startTime = null;
          const step = (currentTime) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);
            // easeOutQuad for smooth deceleration
            const easeOutProgress = progress * (2 - progress);
            setCount(easeOutProgress * endValue);
            if (progress < 1) {
              window.requestAnimationFrame(step);
            }
          };
          window.requestAnimationFrame(step);
          observer.disconnect(); // Only animate once when scrolled into view
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [endValue, duration]);

  let formattedCount = '';
  if (decimals > 0) {
    formattedCount = count.toFixed(decimals);
  } else {
    formattedCount = Math.floor(count).toLocaleString();
  }

  return <span ref={ref}>{prefix}{formattedCount}{suffix}</span>;
};

export default CountUp;
