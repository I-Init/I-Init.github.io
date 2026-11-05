import React from "react";

import ExpandableImage from "@/components/ExpandableImage";

type FigureProp = { img_src: string; alt: string; title: string; caption: React.ReactNode; idx: number; width?: number; height?: number; }

const Figure = ({ img_src, alt, title, caption, idx, width, height }: FigureProp) => {
  return (
    <figure className='flex flex-col items-center justify-center'>
      <ExpandableImage
        src={img_src}
        alt={alt}
        title={title}
        width={width}
        height={height}
      />
      <figcaption className='figure-caption'>
        <strong>Figure {idx}. {title}.</strong>{' '}{caption}
      </figcaption>
    </figure>
  );
}

export default Figure;
