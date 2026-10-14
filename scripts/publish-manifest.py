#!/usr/bin/env python3
"""Publish tags only when both native images passed verification for this commit."""
import argparse
import json
from pathlib import Path
import re
import subprocess


def publish(image, source, digests, metadata, version):
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('Invalid source commit')
    records = sorted(Path(digests).glob('*.json'))
    if {record.name for record in records} != {'amd64.json', 'arm64.json'}:
        raise ValueError('Both verified architecture records are required')
    references = []
    for arch in ['amd64', 'arm64']:
        record = json.loads((Path(digests) / (arch + '.json')).read_text())
        if any(record.get(key) != value for key, value in
               dict(image=image, source=source, version=version, arch=arch).items()):
            raise ValueError('Image verification does not match the final source: ' + arch)
        digest = record.get('digest', '')
        if not isinstance(digest, str) or not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
            raise ValueError('Invalid verified image digest: ' + arch)
        references.append(image + '@' + digest)
    if len(set(references)) != 2:
        raise ValueError('Architecture digests must be distinct')
    labels = metadata.get('labels', {})
    if labels.get('org.opencontainers.image.revision') != source:
        raise ValueError('Image metadata does not match the final source')
    tags = metadata.get('tags', [])
    if not isinstance(tags, list) or not tags:
        raise ValueError('At least one image tag is required')
    command = ['docker', 'buildx', 'imagetools', 'create']
    for tag in dict.fromkeys(tags):
        if not isinstance(tag, str) or not tag.startswith(image + ':') or not re.fullmatch(r'[\w][\w.-]{0,127}', tag[len(image) + 1:], re.ASCII):
            raise ValueError('Invalid image tag')
        command.extend(['--tag', tag])
    subprocess.run(command + references, check=True)
    print('Published verified amd64 and arm64 digests; no image rebuild')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--digests', required=True)
    parser.add_argument('--metadata', required=True)
    args = parser.parse_args()
    publish(args.image, args.source, args.digests, json.loads(Path(args.metadata).read_text()),
            json.loads(Path('package.json').read_text())['version'])
