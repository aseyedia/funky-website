#!/bin/bash

# Define the base directory
base_dir="./src/assets/hdr/ocean_hdri"

# Loop through each subdirectory
for dir in "$base_dir"/*; do
  if [ -d "$dir" ]; then
    # Check for specific depth map filenames and rename them to 'depth.jpg'
    for file in "$dir"/DepthMap.jpg "$dir"/depth.jpg "$dir"/Depth.jpg; do
      if [ -f "$file" ]; then
        mv "$file" "$dir/depth.jpg"
        echo "Renamed $file to $dir/depth.jpg"
      fi
    done
  fi
done
