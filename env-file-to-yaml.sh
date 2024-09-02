#!/bin/bash

# Usage: ./script.sh input.env output.yaml

input_file=$1
output_file=$2

# Check if the input file exists
if [ ! -f "$input_file" ]; then
    echo "Input file does not exist: $input_file"
    exit 1
fi

# Create a temporary file
temp_file=$(mktemp)

# Add a newline to the end of the input file if it doesn't already have one
if [[ $(tail -c1 "$input_file" | wc -l) -ne 1 ]]; then
    echo "" >> "$input_file"
fi

# Read the input file line by line
while IFS= read -r line
do
    # If the line is a comment, write it to the temporary file as is
    if [[ $line == \#* ]]; then
        echo "$line" >> "$temp_file"
        continue
    fi

    # If the line is empty, write it to the temporary file as is
    if [[ -z "$line" ]]; then
        echo "$line" >> "$temp_file"
        continue
    fi

    # Split the line into key and value
    IFS='=' read -ra kv <<< "$line"
    if [ ${#kv[@]} -lt 1 ]; then
        echo "Invalid .env syntax in line: $line"
        exit 1
    fi

    # Write the key and value to the temporary file in YAML format
    # If the value is empty, write an empty string
    # If the value is a number, write it without quotes
    # If the value is already enclosed in quotes, write it as is
    if [ ${#kv[@]} -eq 1 ]; then
        echo "${kv[0]}: ''" >> "$temp_file"
    elif [[ ${kv[1]} =~ ^[0-9]+$ ]]; then
        echo "${kv[0]}: ${kv[1]}" >> "$temp_file"
    elif [[ ${kv[1]} =~ ^\".*\"$ || ${kv[1]} =~ ^\'.*\'$ ]]; then
        echo "${kv[0]}: ${kv[1]}" >> "$temp_file"
    else
        echo "${kv[0]}: '${kv[1]}'" >> "$temp_file"
    fi
done < "$input_file"

# Move the temporary file to the output file
mv "$temp_file" "$output_file"