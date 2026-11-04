import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Image from 'next/image';
import emptyTable from '@/images/Interview.png';

function Illustration() {
  return (
    <Image src={emptyTable} alt="" width={150} height={120} />
  );
}

interface Props {
  title: string;
  description: string;
}

export default function EmptyState({ title, description }: Props) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 0.5,
        flex: 1,
        minHeight: 0,
        width: '100%',
      }}
    >
      <Illustration />
      <Typography variant="body2" fontWeight={700} sx={{ mt: 2 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );
}
